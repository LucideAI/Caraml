import type { StateCreator } from 'zustand';
import type { EditorTab } from '../types';
import type { AppState } from './types';
import { api } from '../services/api';

export interface EditorSlice {
  activeFile: string;
  openTabs: EditorTab[];
  setActiveFile: (filename: string) => void;
  openFile: (filename: string) => void;
  closeTab: (filename: string) => void;
  updateFileContent: (filename: string, content: string) => void;
  createFile: (filename: string) => void;
  deleteFile: (filename: string) => void;
  restoreFile: (filename: string, content: string, language: string) => void;
  renameFile: (oldName: string, newName: string) => void;
}

export const createEditorSlice: StateCreator<AppState, [], [], EditorSlice> = (set, get) => ({
  activeFile: '',
  openTabs: [],

  setActiveFile: (filename) => {
    set({ activeFile: filename });
    const { currentProject } = get();
    if (currentProject) {
      api.updateProject(currentProject.id, { last_opened_file: filename }).catch(() => { });
    }
  },

  openFile: (filename) => {
    set((state) => {
      const exists = state.openTabs.find((t) => t.filename === filename);
      if (exists) return { activeFile: filename };
      return {
        openTabs: [...state.openTabs, { filename, isModified: false }],
        activeFile: filename,
      };
    });
  },

  closeTab: (filename) => {
    set((state) => {
      const newTabs = state.openTabs.filter((t) => t.filename !== filename);
      const newActive = state.activeFile === filename
        ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].filename : '')
        : state.activeFile;
      return { openTabs: newTabs, activeFile: newActive };
    });
  },

  updateFileContent: (filename, content) => {
    set((state) => {
      if (!state.currentProject) return state;
      const newFiles = { ...state.currentProject.files };
      if (newFiles[filename]) {
        newFiles[filename] = { ...newFiles[filename], content };
      }
      const newTabs = state.openTabs.map((t) =>
        t.filename === filename ? { ...t, isModified: true } : t
      );
      return {
        currentProject: { ...state.currentProject, files: newFiles },
        openTabs: newTabs,
        isDirty: true,
      };
    });
  },

  createFile: (filename) => {
    set((state) => {
      if (!state.currentProject) return state;
      const ext = filename.endsWith('.mli') ? 'ocaml' : filename.endsWith('.ml') ? 'ocaml' : 'text';
      const newFiles = {
        ...state.currentProject.files,
        [filename]: { content: `(* ${filename} *)\n`, language: ext },
      };
      return {
        currentProject: { ...state.currentProject, files: newFiles },
        openTabs: [...state.openTabs, { filename, isModified: false }],
        activeFile: filename,
        isDirty: true,
      };
    });
  },

  deleteFile: (filename) => {
    set((state) => {
      if (!state.currentProject) return state;
      const newFiles = { ...state.currentProject.files };
      delete newFiles[filename];
      const newTabs = state.openTabs.filter((t) => t.filename !== filename);
      const newActive = state.activeFile === filename
        ? (newTabs.length > 0 ? newTabs[0].filename : '')
        : state.activeFile;
      return {
        currentProject: { ...state.currentProject, files: newFiles },
        openTabs: newTabs,
        activeFile: newActive,
        isDirty: true,
      };
    });
  },

  restoreFile: (filename, content, language) => {
    set((state) => {
      if (!state.currentProject) return state;
      const newFiles = {
        ...state.currentProject.files,
        [filename]: { content, language },
      };
      return {
        currentProject: { ...state.currentProject, files: newFiles },
        openTabs: [...state.openTabs, { filename, isModified: false }],
        activeFile: filename,
        isDirty: true,
      };
    });
  },

  renameFile: (oldName, newName) => {
    set((state) => {
      if (!state.currentProject) return state;
      const newFiles = { ...state.currentProject.files };
      if (newFiles[oldName]) {
        newFiles[newName] = newFiles[oldName];
        delete newFiles[oldName];
      }
      const newTabs = state.openTabs.map((t) =>
        t.filename === oldName ? { ...t, filename: newName } : t
      );
      return {
        currentProject: { ...state.currentProject, files: newFiles },
        openTabs: newTabs,
        activeFile: state.activeFile === oldName ? newName : state.activeFile,
        isDirty: true,
      };
    });
  },
});
