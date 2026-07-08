/**
 * Bundle Monaco locally instead of pulling it from the jsdelivr CDN at runtime.
 * This makes the IDE work offline / behind filtered networks and pins the
 * editor version to the one declared in package.json.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

// OCaml is a custom Monarch language: only the base editor worker is needed.
(globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export { monaco };
