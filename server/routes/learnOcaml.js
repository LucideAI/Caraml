import { Router } from 'express';
import { runOcamlToplevel } from './ocaml.js';

const router = Router();

async function learnOcamlFetch(serverUrl, path, token, options = {}) {
  const baseUrl = serverUrl.replace(/\/+$/, '');
  const separator = path.includes('?') ? '&' : '?';
  const tokenParam = token ? `${separator}token=${encodeURIComponent(token)}` : '';
  const url = `${baseUrl}/${path}${tokenParam}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const ct = response.headers.get('content-type') || '';
    if (ct.includes('json')) return response.json();
    return response.text();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

function parseLearnOcamlReport(report) {
  if (!Array.isArray(report)) return [];
  const parsed = [];
  for (const section of report) {
    const sectionTitle = (section.section || [])
      .map(t => t.text || '').join(' ').trim();
    const contents = section.contents || [];
    for (const item of contents) {
      const msg = (item.message || []).map(t => t.text || '').join(' ').trim();
      let status = 'info';
      let points;
      if (item.result === 'failure') {
        status = 'failure';
      } else if (item.result === 'informative') {
        status = 'info';
      } else if (typeof item.result === 'number') {
        status = item.result > 0 ? 'success' : 'failure';
        points = item.result;
      }
      parsed.push({ section: sectionTitle, status, message: msg, points });
    }
  }
  return parsed;
}

function parseExerciseIndex(data) {
  let rawIndex = {};
  let grades = {};

  if (Array.isArray(data) && data.length >= 1) {
    const indexObj = data[0] || {};
    rawIndex = indexObj.groups || {};
    if (data[1] && typeof data[1] === 'object' && !Array.isArray(data[1])) {
      grades = data[1];
    }
  }

  const tree = [];
  for (const [groupKey, group] of Object.entries(rawIndex)) {
    const children = [];
    const exercises = group.exercises || [];
    for (const exEntry of exercises) {
      if (Array.isArray(exEntry) && exEntry.length >= 2) {
        const [exId, meta] = exEntry;
        children.push({
          id: exId,
          title: meta.title || exId,
          short_description: meta.short_description || '',
          stars: meta.stars || 0,
          kind: meta.kind || 'exercise',
        });
      }
    }
    tree.push({ title: group.title || groupKey, children });
  }
  return { tree, grades };
}

function parseExerciseDescription(descr) {
  if (!descr) return '';
  if (typeof descr === 'string') return descr;
  if (Array.isArray(descr)) {
    return descr.map(part => {
      if (Array.isArray(part) && part.length >= 2) return part[1];
      if (typeof part === 'string') return part;
      return '';
    }).join('\n');
  }
  return '';
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.post('/learn-ocaml/connect', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    let version = 'unknown';
    try {
      const vData = await learnOcamlFetch(serverUrl, 'version', null);
      if (vData && vData.version) version = vData.version;
    } catch (err) {
      return res.status(502).json({ error: `Cannot reach Learn OCaml server: ${err.message}` });
    }

    let nickname = null;
    let save = null;
    try {
      save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.nickname) nickname = save.nickname;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token — authentication failed. Please check your token.' });
    }

    if (!save) {
      try {
        const minimalSave = { nickname: '', exercises: {} };
        await learnOcamlFetch(serverUrl, 'sync', token, {
          method: 'POST',
          body: JSON.stringify(minimalSave),
        });
        const verifiedSave = await learnOcamlFetch(serverUrl, 'save.json', token);
        if (!verifiedSave) {
          return res.status(401).json({ error: 'Invalid token — this token is not registered on the server.' });
        }
        if (verifiedSave.nickname) nickname = verifiedSave.nickname;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token — authentication failed. Please check your token.' });
      }
    }

    res.json({ version, nickname });
  } catch (err) {
    console.error('Learn OCaml connect error:', err);
    res.status(500).json({ error: 'Failed to connect to Learn OCaml server' });
  }
});

router.post('/learn-ocaml/exercises', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    const data = await learnOcamlFetch(serverUrl, 'exercise-index.json', token);
    if (!data) {
      return res.status(404).json({ error: 'Could not fetch exercise index' });
    }

    const { tree, grades: indexGrades } = parseExerciseIndex(data);

    let saveGrades = {};
    try {
      const save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.exercises) {
        for (const [exId, exState] of Object.entries(save.exercises)) {
          if (exState && typeof exState.grade === 'number') {
            saveGrades[exId] = exState.grade;
          }
        }
      }
    } catch {
      // No save data yet
    }

    const grades = { ...indexGrades, ...saveGrades };
    res.json({ index: tree, grades });
  } catch (err) {
    console.error('Learn OCaml exercises error:', err);
    res.status(500).json({ error: `Failed to fetch exercises: ${err.message}` });
  }
});

router.post('/learn-ocaml/exercise/*', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    const exerciseId = req.params[0];
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, and exercise ID are required' });
    }

    const data = await learnOcamlFetch(serverUrl, `exercises/${exerciseId}.json`, token);
    if (!data) {
      return res.status(404).json({ error: `Exercise "${exerciseId}" not found` });
    }

    let meta = {}, exercise = {}, grade = null;
    if (Array.isArray(data) && data.length >= 2) {
      meta = data[0] || {};
      exercise = data[1] || {};
      grade = data.length > 2 ? data[2] : null;
    }

    let userAnswer = null;
    try {
      const save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.exercises && save.exercises[exerciseId]) {
        userAnswer = save.exercises[exerciseId].solution || null;
      }
    } catch {
      // No save data
    }

    res.json({
      id: exercise.id || exerciseId,
      title: meta.title || exerciseId,
      description: parseExerciseDescription(exercise.descr),
      prelude: exercise.prelude || '',
      template: exercise.template || '',
      max_score: exercise['max-score'] || meta['max-score'] || 100,
      grade,
      userAnswer,
    });
  } catch (err) {
    console.error('Learn OCaml exercise error:', err);
    res.status(500).json({ error: `Failed to fetch exercise: ${err.message}` });
  }
});

router.post('/learn-ocaml/save', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    const save = await learnOcamlFetch(serverUrl, 'save.json', token);
    res.json(save || { nickname: '', exercises: {} });
  } catch (err) {
    console.error('Learn OCaml save error:', err);
    res.status(500).json({ error: `Failed to fetch save: ${err.message}` });
  }
});

router.post('/learn-ocaml/sync-answer', async (req, res) => {
  try {
    const { serverUrl, token, exerciseId, code } = req.body;
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, and exerciseId are required' });
    }

    let save = await learnOcamlFetch(serverUrl, 'save.json', token);
    if (!save || typeof save !== 'object') {
      save = { nickname: '', exercises: {} };
    }
    if (!save.exercises) save.exercises = {};

    if (!save.exercises[exerciseId]) {
      save.exercises[exerciseId] = {};
    }
    // Strip old grade/report so we don't re-sync stale grading data
    delete save.exercises[exerciseId].grade;
    delete save.exercises[exerciseId].report;
    save.exercises[exerciseId].solution = code;
    save.exercises[exerciseId].mtime = Date.now() / 1000;

    await learnOcamlFetch(serverUrl, 'sync', token, {
      method: 'POST',
      body: JSON.stringify(save),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Learn OCaml sync error:', err);
    res.status(500).json({ error: `Failed to sync answer: ${err.message}` });
  }
});

router.post('/learn-ocaml/grade', async (req, res) => {
  try {
    const { serverUrl, token, exerciseId, code } = req.body;
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, exerciseId, and code are required' });
    }

    // First, sync the answer so it's saved regardless of grading outcome
    let save = await learnOcamlFetch(serverUrl, 'save.json', token);
    if (!save || typeof save !== 'object') {
      save = { nickname: '', exercises: {} };
    }
    if (!save.exercises) save.exercises = {};
    if (!save.exercises[exerciseId]) save.exercises[exerciseId] = {};
    // Strip old grade/report so we don't re-sync stale grading data
    delete save.exercises[exerciseId].grade;
    delete save.exercises[exerciseId].report;
    save.exercises[exerciseId].solution = code;
    save.exercises[exerciseId].mtime = Date.now() / 1000;

    // Sync the code (saves the answer on the server)
    await learnOcamlFetch(serverUrl, 'sync', token, {
      method: 'POST',
      body: JSON.stringify(save),
    });

    // Read back the save to check if the server computed a fresh grade during sync
    const updatedSave = await learnOcamlFetch(serverUrl, 'save.json', token);
    const exState = updatedSave?.exercises?.[exerciseId] || {};

    const hasGrade = typeof exState.grade === 'number';
    const hasReport = Array.isArray(exState.report) && exState.report.length > 0;

    // If the server graded during sync, return the server grade
    if (hasGrade || hasReport) {
      return res.json({
        grade: hasGrade ? exState.grade : null,
        max_grade: 100,
        report: parseLearnOcamlReport(exState.report || []),
        synced: true,
      });
    }

    // Server didn't grade — compile the code locally for feedback
    // Fetch the exercise to get the prelude
    let prelude = '';
    try {
      const exData = await learnOcamlFetch(serverUrl, `exercises/${exerciseId}.json`, token);
      if (Array.isArray(exData) && exData.length >= 2 && exData[1]?.prelude) {
        prelude = exData[1].prelude;
      }
    } catch { /* ignore */ }

    const fullCode = prelude ? `${prelude}\n\n(* === Your code === *)\n${code}` : code;
    const compileResult = await runOcamlToplevel(fullCode);

    if (!compileResult) {
      // OCaml not available on backend
      return res.json({
        grade: null,
        max_grade: 100,
        report: [],
        synced: true,
        message: 'Code synced to Learn OCaml. Server-side grading is not available — use the official Learn OCaml client to grade.',
      });
    }

    // Build a report from compilation results
    const report = [];
    if (compileResult.errors.length > 0) {
      for (const err of compileResult.errors) {
        report.push({
          section: 'Compilation',
          status: err.message.startsWith('Warning') ? 'info' : 'failure',
          message: err.message + (err.line > 0 ? ` (line ${err.line})` : ''),
        });
      }
    }

    if (compileResult.values.length > 0) {
      for (const val of compileResult.values) {
        report.push({
          section: 'Defined values',
          status: 'success',
          message: `val ${val.name} : ${val.type} = ${val.value}`,
        });
      }
    }

    const hasErrors = compileResult.errors.some(e => !e.message.startsWith('Warning'));

    if (!hasErrors && compileResult.exitCode === 0) {
      report.unshift({
        section: 'Compilation',
        status: 'success',
        message: 'Code compiles and runs successfully.',
      });
    }

    res.json({
      grade: null,
      max_grade: 100,
      report,
      synced: true,
      message: hasErrors
        ? 'Code has compilation errors. Fix them and try again.'
        : 'Code synced and compiles OK. Full grading requires the official Learn OCaml client.',
    });
  } catch (err) {
    console.error('Learn OCaml grade error:', err);
    res.status(500).json({ error: `Failed to grade exercise: ${err.message}` });
  }
});

export default router;
