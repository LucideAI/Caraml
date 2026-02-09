import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { authenticate, optionalAuth } from '../middleware.js';

const router = Router();

router.get('/projects', authenticate, (req, res) => {
  try {
    const projects = db.prepare(
      'SELECT id, name, description, is_public, share_id, last_opened_file, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(req.user.id);
    res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/projects', authenticate, (req, res) => {
  try {
    const { name, description, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const id = randomUUID();
    let defaultContent = '(* New OCaml Project *)\n\nlet () =\n    print_endline "Hello, World!"\n';

    if (template === 'algorithms') {
      defaultContent = `(* Algorithms & Data Structures *)

(* Binary search *)
let binary_search arr target =
    let rec aux lo hi =
        if lo > hi then -1
        else
            let mid = (lo + hi) / 2 in
            if arr.(mid) = target then mid
            else if arr.(mid) < target then aux (mid + 1) hi
            else aux lo (mid - 1)
    in
    aux 0 (Array.length arr - 1)

(* Quick sort *)
let rec quicksort = function
    | [] -> []
    | pivot :: rest ->
        let left = List.filter (fun x -> x < pivot) rest in
        let right = List.filter (fun x -> x >= pivot) rest in
        quicksort left @ [pivot] @ quicksort right

let () =
    let sorted = quicksort [3; 6; 8; 10; 1; 2; 1] in
    List.iter (fun x -> Printf.printf "%d " x) sorted;
    print_newline ()
`;
    } else if (template === 'functional') {
      defaultContent = `(* Functional Programming Patterns *)

(* Option monad *)
let ( >>= ) opt f = match opt with
    | None -> None
    | Some x -> f x

let ( >>| ) opt f = match opt with
    | None -> None
    | Some x -> Some (f x)

(* Pipe operator *)
let ( |> ) x f = f x

(* Function composition *)
let compose f g x = f (g x)

(* Currying examples *)
let add x y = x + y
let add5 = add 5

let () =
    let result = Some 42 >>| (fun x -> x * 2) >>= (fun x ->
        if x > 50 then Some x else None
    ) in
    match result with
    | Some v -> Printf.printf "Result: %d\\n" v
    | None -> print_endline "No result"
`;
    }

    const files = JSON.stringify({
      'main.ml': { content: defaultContent, language: 'ocaml' }
    });

    db.prepare('INSERT INTO projects (id, user_id, name, description, files) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, description || '', files);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json({ project: { ...project, files: JSON.parse(project.files) } });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/projects/:id', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: { ...project, files: JSON.parse(project.files) } });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/projects/:id', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, description, files, last_opened_file } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (files !== undefined) { updates.push('files = ?'); params.push(JSON.stringify(files)); }
    if (last_opened_file !== undefined) { updates.push('last_opened_file = ?'); params.push(last_opened_file); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project: { ...updated, files: JSON.parse(updated.files) } });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/projects/:id', authenticate, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Sharing Routes ──────────────────────────────────────────────────────────
router.post('/projects/:id/share', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let shareId = project.share_id;
    if (!shareId) {
      shareId = randomUUID().slice(0, 8);
      db.prepare('UPDATE projects SET share_id = ?, is_public = 1 WHERE id = ?').run(shareId, req.params.id);
    } else {
      db.prepare('UPDATE projects SET is_public = 1 WHERE id = ?').run(req.params.id);
    }

    res.json({ share_id: shareId, url: `/shared/${shareId}` });
  } catch (err) {
    console.error('Share project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/projects/:id/unshare', authenticate, (req, res) => {
  try {
    db.prepare('UPDATE projects SET is_public = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Unshare project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/shared/:shareId', optionalAuth, (req, res) => {
  try {
    const project = db.prepare(
      `SELECT p.*, u.username as author_name FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.share_id = ? AND p.is_public = 1`
    ).get(req.params.shareId);

    if (!project) return res.status(404).json({ error: 'Shared project not found' });

    res.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        files: JSON.parse(project.files),
        author_name: project.author_name,
        is_owner: req.user ? req.user.id === project.user_id : false,
        created_at: project.created_at,
        updated_at: project.updated_at,
      }
    });
  } catch (err) {
    console.error('Get shared project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/shared/:shareId/fork', authenticate, (req, res) => {
  try {
    const project = db.prepare(
      `SELECT p.*, u.username as author_name FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.share_id = ? AND p.is_public = 1`
    ).get(req.params.shareId);

    if (!project) return res.status(404).json({ error: 'Shared project not found' });

    const newId = randomUUID();
    db.prepare('INSERT INTO projects (id, user_id, name, description, files) VALUES (?, ?, ?, ?, ?)')
      .run(newId, req.user.id, `${project.name} (fork)`, project.description, project.files);

    const forked = db.prepare('SELECT * FROM projects WHERE id = ?').get(newId);
    res.json({ project: { ...forked, files: JSON.parse(forked.files) } });
  } catch (err) {
    console.error('Fork project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
