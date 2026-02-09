import type { StateCreator } from 'zustand';
import type { Notification, User } from '../types';
import type { AppState } from './types';
import {
  clampPanelWidth,
  clampConsoleHeight,
  DEFAULT_FILE_TREE_WIDTH,
  DEFAULT_MEMORY_PANEL_WIDTH,
  DEFAULT_CONSOLE_HEIGHT,
  PANEL_LIMITS,
  type PanelWidthMode,
} from '../utils/panelSizing';
import { api } from '../services/api';

function getStoredPanelWidths(user: User | null | undefined) {
  const panelWidths = user?.ui_prefs?.panelWidths;
  if (!panelWidths || typeof panelWidths !== 'object') return {};
  return panelWidths;
}

function clampRuntimePanelWidth(kind: 'fileTree' | 'memory', width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback;
  return Math.round(Math.min(PANEL_LIMITS[kind].max, Math.max(0, width)));
}

export interface UiSlice {
  showMemoryPanel: boolean;
  showFileTree: boolean;
  showConsole: boolean;
  showAuthModal: boolean;
  showShareModal: boolean;
  showNewProjectModal: boolean;
  consoleFontSize: number;
  editorFontSize: number;
  consoleHeight: number;
  fileTreeWidth: number;
  memoryPanelWidth: number;
  fileTreeWidthMode: PanelWidthMode;
  memoryPanelWidthMode: PanelWidthMode;
  notifications: Notification[];
  toggleMemoryPanel: () => void;
  toggleFileTree: () => void;
  toggleConsole: () => void;
  setShowAuthModal: (show: boolean) => void;
  setShowShareModal: (show: boolean) => void;
  setShowNewProjectModal: (show: boolean) => void;
  addNotification: (type: Notification['type'], message: string) => void;
  removeNotification: (id: string) => void;
  setEditorFontSize: (size: number) => void;
  setConsoleFontSize: (size: number) => void;
  setConsoleHeight: (height: number) => void;
  hydrateUiPrefsFromUser: (user: User | null) => void;
  setFileTreeWidth: (width: number, mode?: PanelWidthMode) => void;
  setMemoryPanelWidth: (width: number, mode?: PanelWidthMode) => void;
  persistPanelWidths: () => Promise<void>;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  showMemoryPanel: true,
  showFileTree: true,
  showConsole: true,
  showAuthModal: false,
  showShareModal: false,
  showNewProjectModal: false,
  consoleFontSize: 13,
  editorFontSize: 14,
  consoleHeight: DEFAULT_CONSOLE_HEIGHT,
  fileTreeWidth: DEFAULT_FILE_TREE_WIDTH,
  memoryPanelWidth: DEFAULT_MEMORY_PANEL_WIDTH,
  fileTreeWidthMode: 'auto',
  memoryPanelWidthMode: 'auto',
  notifications: [],

  toggleMemoryPanel: () => set((s) => ({ showMemoryPanel: !s.showMemoryPanel })),
  toggleFileTree: () => set((s) => ({ showFileTree: !s.showFileTree })),
  toggleConsole: () => set((s) => ({ showConsole: !s.showConsole })),
  setShowAuthModal: (show) => set({ showAuthModal: show }),
  setShowShareModal: (show) => set({ showShareModal: show }),
  setShowNewProjectModal: (show) => set({ showNewProjectModal: show }),

  addNotification: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ notifications: [...s.notifications, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    }, 4000);
  },

  removeNotification: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },

  setEditorFontSize: (size) => set({ editorFontSize: size }),
  setConsoleFontSize: (size) => set({ consoleFontSize: size }),
  setConsoleHeight: (height) => set({ consoleHeight: clampConsoleHeight(height) }),

  hydrateUiPrefsFromUser: (user) => {
    const storedWidths = getStoredPanelWidths(user);
    const hasFileTreeWidth = Number.isFinite(storedWidths.fileTree);
    const hasMemoryWidth = Number.isFinite(storedWidths.memory);

    set({
      fileTreeWidth: hasFileTreeWidth
        ? clampPanelWidth('fileTree', Number(storedWidths.fileTree))
        : DEFAULT_FILE_TREE_WIDTH,
      memoryPanelWidth: hasMemoryWidth
        ? clampPanelWidth('memory', Number(storedWidths.memory))
        : DEFAULT_MEMORY_PANEL_WIDTH,
      fileTreeWidthMode: hasFileTreeWidth ? 'manual' : 'auto',
      memoryPanelWidthMode: hasMemoryWidth ? 'manual' : 'auto',
    });
  },

  setFileTreeWidth: (width, mode) => set((state) => ({
    fileTreeWidth: clampRuntimePanelWidth('fileTree', width, state.fileTreeWidth),
    fileTreeWidthMode: mode ?? state.fileTreeWidthMode,
  })),

  setMemoryPanelWidth: (width, mode) => set((state) => ({
    memoryPanelWidth: clampRuntimePanelWidth('memory', width, state.memoryPanelWidth),
    memoryPanelWidthMode: mode ?? state.memoryPanelWidthMode,
  })),

  persistPanelWidths: async () => {
    const { user, fileTreeWidth, memoryPanelWidth } = get();
    if (!user) return;
    try {
      const { user: updatedUser } = await api.updatePreferences({
        panelWidths: {
          fileTree: clampPanelWidth('fileTree', fileTreeWidth),
          memory: clampPanelWidth('memory', memoryPanelWidth),
        },
      });
      const nextUiPrefs = updatedUser?.ui_prefs || {};
      const currentUiPrefs = get().user?.ui_prefs || {};
      const hasUiPrefsChanged = JSON.stringify(nextUiPrefs) !== JSON.stringify(currentUiPrefs);

      if (hasUiPrefsChanged) {
        set((state) => ({
          user: state.user ? { ...state.user, ui_prefs: nextUiPrefs } : state.user,
        }));
      }
    } catch {
      get().addNotification('warning', 'Unable to save panel width preferences');
    }
  },
});
