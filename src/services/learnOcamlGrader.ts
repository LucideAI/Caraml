/**
 * Learn OCaml Grader Service
 * 
 * Client-side grading using the Learn OCaml grader Web Worker.
 * The grading happens entirely in the browser:
 * 1. Fetch the raw exercise data (with compiled test bytecode) from backend proxy
 * 2. Fetch the grader worker script from backend proxy  
 * 3. Create a Web Worker from the script
 * 4. Post exercise data + user code to the worker
 * 5. Receive progress updates and final report
 */

import type { LearnOcamlGradeResult, LearnOcamlReportItem } from '../types';

const API_BASE = '/api/learn-ocaml';

export interface GradeProgressCallback {
  (message: string): void;
}

interface GraderWorkerMessage {
  data: [string, ...unknown[]];
}

/**
 * Fetch the grader worker script from our backend proxy and create a Blob URL.
 * Cached in memory for the session.
 */
let cachedWorkerBlobUrl: string | null = null;
let cachedServerUrl: string | null = null;

async function getWorkerBlobUrl(serverUrl: string): Promise<string> {
  if (cachedWorkerBlobUrl && cachedServerUrl === serverUrl) {
    return cachedWorkerBlobUrl;
  }

  const mainToken = localStorage.getItem('caraml_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (mainToken) {
    headers['Authorization'] = `Bearer ${mainToken}`;
  }

  const response = await fetch(`${API_BASE}/grader-worker`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ serverUrl, filename: 'learnocaml-grader-worker.js' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch grader worker: HTTP ${response.status}`);
  }

  const scriptContent = await response.text();

  // Create a Blob URL from the fetched script content
  const blob = new Blob([scriptContent], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  // Clean up previous blob URL
  if (cachedWorkerBlobUrl) {
    URL.revokeObjectURL(cachedWorkerBlobUrl);
  }

  cachedWorkerBlobUrl = blobUrl;
  cachedServerUrl = serverUrl;
  return blobUrl;
}

/**
 * Fetch the raw exercise JSON (with compiled test bytecode) from the backend proxy.
 */
async function fetchRawExerciseData(serverUrl: string, token: string, exerciseId: string): Promise<unknown[]> {
  const mainToken = localStorage.getItem('caraml_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (mainToken) {
    headers['Authorization'] = `Bearer ${mainToken}`;
  }

  const response = await fetch(`${API_BASE}/exercise-raw/${exerciseId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ serverUrl, token }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch exercise data: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Parse the grading report from the Learn OCaml worker format to our format.
 */
function parseWorkerReport(report: unknown): LearnOcamlReportItem[] {
  if (!Array.isArray(report)) return [];

  const items: LearnOcamlReportItem[] = [];

  function processItem(item: unknown, parentTitle = ''): void {
    if (!item || typeof item !== 'object') return;
    const it = item as Record<string, unknown>;

    // Handle Section variant: { section: text[], contents: item[] }
    if ('section' in it && Array.isArray(it.contents)) {
      let sectionTitle = parentTitle;
      if (Array.isArray(it.section)) {
        const titleParts = it.section.map((t: unknown) => {
          if (t && typeof t === 'object' && 'text' in (t as object)) {
            return (t as { text: string }).text;
          }
          if (typeof t === 'string') return t;
          return '';
        });
        sectionTitle = titleParts.join(' ').trim() || parentTitle;
      }

      for (const nestedItem of it.contents) {
        processItem(nestedItem, sectionTitle);
      }
      return;
    }

    // Handle Message variant: { message: text[], result: status/score }
    if ('message' in it) {
      const msg = Array.isArray(it.message)
        ? it.message.map((t: unknown) => {
            if (t && typeof t === 'object' && 'text' in (t as object)) {
              return (t as { text: string }).text;
            }
            if (typeof t === 'string') return t;
            return '';
          }).join(' ').trim()
        : String(it.message || '');

      let status: LearnOcamlReportItem['status'] = 'info';
      let points: number | undefined;

      const result = it.result || it.status; // Fallback to status just in case

      if (result === 'failure') {
        status = 'failure';
      } else if (result === 'informative') {
        status = 'info';
      } else if (result === 'warning') {
        status = 'warning';
      } else if (result === 'success') {
        status = 'success';
      } else if (typeof result === 'number') {
        status = result > 0 ? 'success' : 'failure';
        points = result;
      }

      items.push({ section: parentTitle, status, message: msg, points });
    }
  }

  for (const item of report) {
    processItem(item);
  }

  return items;
}

/**
 * Grade an exercise using the Learn OCaml grader Web Worker.
 * 
 * @param serverUrl - The Learn OCaml server URL
 * @param token - The user's authentication token
 * @param exerciseId - The exercise ID (e.g. "tp6/unionfind")
 * @param code - The user's code to grade
 * @param onProgress - Optional callback for progress updates
 * @param timeoutMs - Timeout in milliseconds (default: 60 seconds)
 * @returns The grading result
 */
export async function gradeWithWorker(
  serverUrl: string,
  token: string,
  exerciseId: string,
  code: string,
  onProgress?: GradeProgressCallback,
  timeoutMs = 60_000,
): Promise<LearnOcamlGradeResult> {
  onProgress?.('Fetching exercise data...');

  // Step 1: Fetch raw exercise data with compiled bytecode
  const rawExerciseData = await fetchRawExerciseData(serverUrl, token, exerciseId);

  onProgress?.('Loading grader worker...');

  // Step 2: Get the grader worker Blob URL
  const workerBlobUrl = await getWorkerBlobUrl(serverUrl);

  onProgress?.('Starting grading...');

  // Step 3: Create a worker and grade
  return new Promise<LearnOcamlGradeResult>((resolve, reject) => {
    let worker: Worker | null = null;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      worker?.terminate();
      reject(new Error('Grading timed out after ' + (timeoutMs / 1000) + ' seconds'));
    }, timeoutMs);

    try {
      worker = new Worker(workerBlobUrl);
    } catch (err) {
      clearTimeout(timer);
      reject(new Error(`Failed to create grader worker: ${err}`));
      return;
    }

    worker.onmessage = (event: MessageEvent) => {
      if (timedOut) return;

      const msg = event.data;

      // The Learn OCaml worker sends two types of messages:
      // 1. A plain string — progress callback (e.g. "Loading the prelude")
      // 2. An object { report, stdout, stderr, outcomes } — final answer

      if (typeof msg === 'string') {
        // Progress callback
        onProgress?.(msg);
        return;
      }

      if (msg && typeof msg === 'object' && 'report' in msg) {
        // Final answer: { report: [...], stdout: "", stderr: "", outcomes: "" }
        clearTimeout(timer);
        const report = parseWorkerReport(msg.report);

        // Calculate grade from the report (sum of points)
        let totalPoints = 0;
        let hasPoints = false;
        for (const item of report) {
          if (item.points !== undefined) {
            totalPoints += item.points;
            hasPoints = true;
          }
        }

        // Calculate max grade from exercise data
        let maxGrade = 100;
        if (Array.isArray(rawExerciseData) && rawExerciseData.length >= 2) {
          const exData = rawExerciseData[1] as Record<string, unknown>;
          if (exData && 'max-score' in exData) {
            maxGrade = (exData['max-score'] as number) || 100;
          }
        }

        const grade = hasPoints ? totalPoints : null;

        worker?.terminate();
        resolve({
          grade,
          max_grade: maxGrade,
          report,
        });
        return;
      }

      // Unknown message format — treat as progress if it's stringifiable
      if (msg != null) {
        onProgress?.(String(msg));
      }
    };

    worker.onerror = (err) => {
      if (timedOut) return;
      clearTimeout(timer);
      worker?.terminate();
      reject(new Error(`Grader worker error: ${err.message || 'Unknown error'}`));
    };

    // Step 4: Post the exercise data and user code to the worker
    // The Learn OCaml grader worker expects: { solution: string, exercise: ExerciseJSON }
    // The exercise is the second element (data[1]) from the raw exercise JSON array
    try {
      const exerciseData = Array.isArray(rawExerciseData) && rawExerciseData.length >= 2
        ? rawExerciseData[1]
        : rawExerciseData;

      const workerInput = {
        solution: code,
        exercise: exerciseData,
      };

      worker.postMessage(workerInput);
    } catch (err) {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(`Failed to send data to grader worker: ${err}`));
    }
  });
}

/**
 * Clean up cached resources.
 */
export function cleanupGrader(): void {
  if (cachedWorkerBlobUrl) {
    URL.revokeObjectURL(cachedWorkerBlobUrl);
    cachedWorkerBlobUrl = null;
    cachedServerUrl = null;
  }
}
