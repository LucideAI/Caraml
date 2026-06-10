import type { ThemeSlice } from './themeSlice';
import type { AuthSlice } from './authSlice';
import type { ProjectSlice } from './projectSlice';
import type { EditorSlice } from './editorSlice';
import type { ExecutionSlice } from './executionSlice';
import type { UiSlice } from './uiSlice';
import type { LearnOcamlSlice } from './learnOcamlSlice';

export interface Capabilities {
  ocaml: boolean;
  ocamlVersion: string | null;
  merlin: boolean;
  ocamlformat: boolean;
}

export type AppState =
  ThemeSlice &
  AuthSlice &
  ProjectSlice &
  EditorSlice &
  ExecutionSlice &
  UiSlice &
  LearnOcamlSlice & {
    capabilities: Capabilities;
    loadCapabilities: () => Promise<void>;
  };
