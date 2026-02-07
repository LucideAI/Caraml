import { create } from 'zustand';
import type {
  User, Project, ProjectFiles, ExecutionResult, MemoryState, Notification, EditorTab,
  LearnOcamlConnection, LearnOcamlExerciseIndexEntry, LearnOcamlExercise,
  LearnOcamlExerciseGroup, LearnOcamlGradeResult,
} from '../types';
import { api } from '../services/api';
import { learnOcamlApi } from '../services/learnOcamlApi';
import {
  clampPanelWidth,
  DEFAULT_FILE_TREE_WIDTH,
  DEFAULT_MEMORY_PANEL_WIDTH,
  PANEL_LIMITS,
  type PanelWidthMode,
} from '../utils/panelSizing';

interface Capabilities {
  ocaml: boolean;
  ocamlVersion: string | null;
  merlin: boolean;
  ocamlformat: boolean;
}

function getStoredPanelWidths(user: User | null | undefined) {
  const panelWidths = user?.ui_prefs?.panelWidths;
  if (!panelWidths || typeof panelWidths !== 'object') return {};
  return panelWidths;
}

function clampRuntimePanelWidth(kind: 'fileTree' | 'memory', width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback;
  return Math.round(Math.min(PANEL_LIMITS[kind].max, Math.max(0, width)));
}

interface AppState {
  // Capabilities
  capabilities: Capabilities;
  loadCapabilities: () => Promise<void>;

  // Auth
  user: User | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;

  // Projects
  projects: Project[];
  currentProject: Project | null;
  isProjectLoading: boolean;
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (name: string, description?: string, template?: string) => Promise<Project>;
  saveProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;

  // Editor
  activeFile: string;
  openTabs: EditorTab[];
  setActiveFile: (filename: string) => void;
  openFile: (filename: string) => void;
  closeTab: (filename: string) => void;
  updateFileContent: (filename: string, content: string) => void;
  createFile: (filename: string) => void;
  deleteFile: (filename: string) => void;
  renameFile: (oldName: string, newName: string) => void;

  // Execution
  executionResult: ExecutionResult | null;
  isRunning: boolean;
  setExecutionResult: (result: ExecutionResult | null) => void;
  setIsRunning: (running: boolean) => void;

  // Memory
  memoryState: MemoryState | null;
  setMemoryState: (state: MemoryState | null) => void;

  // UI
  showMemoryPanel: boolean;
  showFileTree: boolean;
  showConsole: boolean;
  showAuthModal: boolean;
  showShareModal: boolean;
  showNewProjectModal: boolean;
  consoleFontSize: number;
  editorFontSize: number;
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
  hydrateUiPrefsFromUser: (user: User | null) => void;
  setFileTreeWidth: (width: number, mode?: PanelWidthMode) => void;
  setMemoryPanelWidth: (width: number, mode?: PanelWidthMode) => void;
  persistPanelWidths: () => Promise<void>;

  // Auto-save
  lastSaved: Date | null;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;

  // ── Learn OCaml ──────────────────────────────────────────────────────────
  learnOcaml: {
    connection: LearnOcamlConnection | null;
    isConnecting: boolean;
    isLoadingExercises: boolean;
    isLoadingExercise: boolean;
    isGrading: boolean;
    isSyncing: boolean;
    exercises: (LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry)[];
    grades: Record<string, number>;
    currentExercise: (LearnOcamlExercise & { grade?: number | null; userAnswer?: string | null }) | null;
    lastGradeResult: LearnOcamlGradeResult | null;
    showConnectModal: boolean;
  };
  learnOcamlConnect: (serverUrl: string, token: string) => Promise<void>;
  learnOcamlDisconnect: () => void;
  learnOcamlLoadExercises: () => Promise<void>;
  learnOcamlLoadExercise: (id: string) => Promise<void>;
  learnOcamlSyncAnswer: (exerciseId: string, code: string) => Promise<void>;
  learnOcamlGrade: (exerciseId: string, code: string) => Promise<LearnOcamlGradeResult>;
  setShowLearnOcamlModal: (show: boolean) => void;
  learnOcamlRestoreConnection: () => void;
}

export const useStore = create<AppState>((set, get) => ({
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

  // ── Auth State ──────────────────────────────────────────────────────────
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

  // ── Projects State ──────────────────────────────────────────────────────
  projects: [],
  currentProject: null,
  isProjectLoading: false,

  loadProjects: async () => {
    set({ isProjectLoading: true });
    try {
      const { projects } = await api.listProjects();
      set({ projects, isProjectLoading: false });
    } catch {
      set({ isProjectLoading: false });
    }
  },

  loadProject: async (id) => {
    set({ isProjectLoading: true });
    try {
      const { project } = await api.getProject(id);
      const firstFile = project.last_opened_file || Object.keys(project.files)[0] || 'main.ml';
      set({
        currentProject: project,
        activeFile: firstFile,
        openTabs: [{ filename: firstFile, isModified: false }],
        isProjectLoading: false,
        executionResult: null,
        memoryState: null,
        isDirty: false,
      });
    } catch {
      set({ isProjectLoading: false });
    }
  },

  createProject: async (name, description, template) => {
    const { project } = await api.createProject(name, description, template);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  saveProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      await api.updateProject(currentProject.id, {
        name: currentProject.name,
        description: currentProject.description,
        files: currentProject.files,
        last_opened_file: get().activeFile,
      });
      set({ isDirty: false, lastSaved: new Date() });
      get().addNotification('success', 'Project saved');
    } catch (err: any) {
      get().addNotification('error', err.message || 'Failed to save');
    }
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  // ── Editor State ────────────────────────────────────────────────────────
  activeFile: '',
  openTabs: [],

  setActiveFile: (filename) => {
    set({ activeFile: filename });
    const { currentProject } = get();
    if (currentProject) {
      api.updateProject(currentProject.id, { last_opened_file: filename }).catch(() => {});
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

  // ── Execution State ─────────────────────────────────────────────────────
  executionResult: null,
  isRunning: false,
  setExecutionResult: (result) => set({ executionResult: result, memoryState: result?.memoryState || null }),
  setIsRunning: (running) => set({ isRunning: running }),

  // ── Memory State ────────────────────────────────────────────────────────
  memoryState: null,
  setMemoryState: (state) => set({ memoryState: state }),

  // ── UI State ────────────────────────────────────────────────────────────
  showMemoryPanel: true,
  showFileTree: true,
  showConsole: true,
  showAuthModal: false,
  showShareModal: false,
  showNewProjectModal: false,
  consoleFontSize: 13,
  editorFontSize: 14,
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
      set((state) => ({
        user: state.user ? { ...state.user, ui_prefs: updatedUser?.ui_prefs } : state.user,
      }));
    } catch {
      get().addNotification('warning', 'Unable to save panel width preferences');
    }
  },

  // ── Auto-save ───────────────────────────────────────────────────────────
  lastSaved: null,
  isDirty: false,
  setIsDirty: (dirty) => set({ isDirty: dirty }),

  // ── Learn OCaml ───────────────────────────────────────────────────────
  learnOcaml: {
    connection: null,
    isConnecting: false,
    isLoadingExercises: false,
    isLoadingExercise: false,
    isGrading: false,
    isSyncing: false,
    exercises: [],
    grades: {},
    currentExercise: null,
    lastGradeResult: null,
    showConnectModal: false,
  },

  learnOcamlConnect: async (serverUrl, token) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isConnecting: true } }));
    try {
      const result = await learnOcamlApi.connect(serverUrl, token);
      const connection: LearnOcamlConnection = {
        serverUrl,
        token,
        nickname: result.nickname || undefined,
        serverVersion: result.version,
      };
      learnOcamlApi.setConnection(connection);
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          connection,
          isConnecting: false,
          showConnectModal: false,
        },
      }));
      get().addNotification('success', `Connected to Learn OCaml${result.nickname ? ` as ${result.nickname}` : ''}`);
      // Auto-load exercises
      get().learnOcamlLoadExercises();
    } catch (err: any) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isConnecting: false } }));
      throw err;
    }
  },

  learnOcamlDisconnect: () => {
    learnOcamlApi.disconnect();
    set((s) => ({
      learnOcaml: {
        ...s.learnOcaml,
        connection: null,
        exercises: [],
        grades: {},
        currentExercise: null,
        lastGradeResult: null,
      },
    }));
    get().addNotification('info', 'Disconnected from Learn OCaml');
  },

  learnOcamlLoadExercises: async () => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercises: true } }));
    try {
      const data = await learnOcamlApi.getExerciseIndex();
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          exercises: data.index,
          grades: data.grades,
          isLoadingExercises: false,
        },
      }));
    } catch (err: any) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercises: false } }));
      get().addNotification('error', `Failed to load exercises: ${err.message}`);
    }
  },

  learnOcamlLoadExercise: async (id) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercise: true, lastGradeResult: null } }));
    try {
      const exercise = await learnOcamlApi.getExercise(id);
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          currentExercise: exercise as any,
          isLoadingExercise: false,
        },
      }));
    } catch (err: any) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercise: false } }));
      get().addNotification('error', `Failed to load exercise: ${err.message}`);
    }
  },

  learnOcamlSyncAnswer: async (exerciseId, code) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: true } }));
    try {
      await learnOcamlApi.updateExerciseAnswer(exerciseId, code);
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: false } }));
    } catch (err: any) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: false } }));
      get().addNotification('error', `Failed to sync: ${err.message}`);
    }
  },

  learnOcamlGrade: async (exerciseId, code) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isGrading: true } }));
    try {
      const result = await learnOcamlApi.gradeExercise(exerciseId, code);
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          isGrading: false,
          lastGradeResult: result,
          grades: { ...s.learnOcaml.grades, [exerciseId]: result.grade ?? 0 },
        },
      }));
      if (result.grade !== null && result.grade !== undefined) {
        get().addNotification(
          result.grade >= 100 ? 'success' : result.grade > 0 ? 'warning' : 'error',
          `Grade: ${result.grade}/${result.max_grade}`
        );
      }
      return result;
    } catch (err: any) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isGrading: false } }));
      get().addNotification('error', `Grading failed: ${err.message}`);
      throw err;
    }
  },

  setShowLearnOcamlModal: (show) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, showConnectModal: show } }));
  },

  learnOcamlRestoreConnection: () => {
    const conn = learnOcamlApi.getConnection();
    if (conn) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, connection: conn } }));
    }
  },
}));
