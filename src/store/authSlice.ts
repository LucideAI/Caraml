import type { StateCreator } from 'zustand';
import type { User } from '../types';
import type { AppState } from './types';
import { api } from '../services/api';
import { DEFAULT_FILE_TREE_WIDTH, DEFAULT_MEMORY_PANEL_WIDTH } from '../utils/panelSizing';

export interface AuthSlice {
  user: User | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  user: null,
  isAuthLoading: true,
  setUser: (user) => {
    set({ user });
    get().hydrateUiPrefsFromUser(user);
  },

  login: async (login, password) => {
    const { token, user } = await api.login(login, password);
    api.setToken(token);
    set({ user, showAuthModal: false });
    get().hydrateUiPrefsFromUser(user);
  },

  register: async (username, email, password) => {
    const { token, user } = await api.register(username, email, password);
    api.setToken(token);
    set({ user, showAuthModal: false });
    get().hydrateUiPrefsFromUser(user);
  },

  logout: () => {
    api.setToken(null);
    set({
      user: null,
      projects: [],
      currentProject: null,
      openTabs: [],
      activeFile: '',
      executionResult: null,
      memoryState: null,
      fileTreeWidth: DEFAULT_FILE_TREE_WIDTH,
      memoryPanelWidth: DEFAULT_MEMORY_PANEL_WIDTH,
      fileTreeWidthMode: 'auto',
      memoryPanelWidthMode: 'auto',
    });
  },

  checkAuth: async () => {
    try {
      if (api.getToken()) {
        const { user } = await api.getMe();
        set({ user, isAuthLoading: false });
        get().hydrateUiPrefsFromUser(user);
      } else {
        set({ isAuthLoading: false });
      }
    } catch {
      api.setToken(null);
      set({ user: null, isAuthLoading: false });
      get().hydrateUiPrefsFromUser(null);
    }
  },
});
