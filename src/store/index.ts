import { create } from 'zustand';
import { api } from '../services/api';
import type { AppState } from './types';
import { createThemeSlice } from './themeSlice';
import { createAuthSlice } from './authSlice';
import { createProjectSlice } from './projectSlice';
import { createEditorSlice } from './editorSlice';
import { createExecutionSlice } from './executionSlice';
import { createUiSlice } from './uiSlice';
import { createLearnOcamlSlice } from './learnOcamlSlice';

export type { AppState } from './types';

export const useStore = create<AppState>()((set, get, store) => ({
  ...createThemeSlice(set, get, store),
  ...createAuthSlice(set, get, store),
  ...createProjectSlice(set, get, store),
  ...createEditorSlice(set, get, store),
  ...createExecutionSlice(set, get, store),
  ...createUiSlice(set, get, store),
  ...createLearnOcamlSlice(set, get, store),

  // ── Capabilities ────────────────────────────────────────────────────────
  capabilities: { ocaml: false, ocamlVersion: null, merlin: false, ocamlformat: false },
  loadCapabilities: async () => {
    try {
      const caps = await api.getCapabilities();
      set({ capabilities: caps });
    } catch {
      // Capabilities unavailable
    }
  },
}));
