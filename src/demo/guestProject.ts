import type { Project } from '../types';

export const GUEST_PROJECT_ID = 'demo';
const GUEST_STORAGE_KEY = 'caraml_guest_project_v1';

const DEMO_SOURCE = `(* Welcome to Caraml! Press Ctrl+Enter to run this code. *)
type 'a tree =
  | Empty
  | Node of 'a * 'a tree * 'a tree

let rec height = function
  | Empty -> 0
  | Node (_, left, right) ->
      1 + max (height left) (height right)

let visits = ref 0

let rec sum = function
  | Empty -> 0
  | Node (value, left, right) ->
      visits := !visits + 1;
      value + sum left + sum right

let tree =
  Node (8,
    Node (3, Node (1, Empty, Empty), Node (6, Empty, Empty)),
    Node (10, Empty, Node (14, Empty, Empty)))

let tree_height = height tree
let tree_sum = sum tree

let () = print_endline "Done! Inspect tree_height, tree_sum, and visits in Memory."
`;

function freshGuestProject(): Project {
  const now = new Date().toISOString();
  return {
    id: GUEST_PROJECT_ID,
    name: 'Interactive OCaml Demo',
    description: 'Explore pattern matching, recursion, references, and memory visualization.',
    files: {
      'main.ml': { content: DEMO_SOURCE, language: 'ocaml' },
      'README.md': {
        language: 'markdown',
        content: `# Caraml guest playground\n\nRun \`main.ml\` with **Ctrl+Enter** and inspect the stack, heap, and environment panels.\n`,
      },
    },
    is_owner: true,
    is_public: 0,
    last_opened_file: 'main.ml',
    created_at: now,
    updated_at: now,
  };
}

export function loadGuestProject(): Project {
  try {
    const saved = localStorage.getItem(GUEST_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Project;
      if (parsed?.id === GUEST_PROJECT_ID && parsed.files?.['main.ml']) {
        return parsed;
      }
    }
  } catch {
    // Storage can be unavailable in private browsing; the demo still works in memory.
  }
  return freshGuestProject();
}

export function persistGuestProject(project: Project): void {
  try {
    localStorage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({ ...project, updated_at: new Date().toISOString() })
    );
  } catch {
    // Saving locally is best-effort; editing and execution remain available.
  }
}
