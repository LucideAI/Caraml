import type { StateCreator } from 'zustand';
import type { AppState } from './types';

export type Theme = 'dark' | 'light';

export interface ThemeSlice {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('caraml-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

export function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

export const createThemeSlice: StateCreator<AppState, [], [], ThemeSlice> = (set, get) => ({
  theme: (() => {
    const t = getStoredTheme();
    applyThemeToDocument(t);
    return t;
  })(),
  setTheme: (theme) => {
    applyThemeToDocument(theme);
    localStorage.setItem('caraml-theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
});
