import type { StateCreator } from 'zustand';
import type { Project, ProjectListItem } from '../types';
import type { AppState } from './types';
import { api } from '../services/api';

export interface ProjectSlice {
  projects: ProjectListItem[];
  currentProject: Project | null;
  isProjectLoading: boolean;
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (name: string, description?: string, template?: string) => Promise<Project>;
  saveProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  lastSaved: Date | null;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
  projects: [],
  currentProject: null,
  isProjectLoading: false,
  lastSaved: null,
  isDirty: false,
  setIsDirty: (dirty) => set({ isDirty: dirty }),

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
    const listItem: ProjectListItem = {
      id: project.id,
      name: project.name,
      description: project.description,
      is_public: project.is_public ?? 0,
      share_id: project.share_id,
      last_opened_file: project.last_opened_file,
      created_at: project.created_at,
      updated_at: project.updated_at,
    };
    set((state) => ({ projects: [listItem, ...state.projects] }));
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
    } catch (err: unknown) {
      get().addNotification('error', err instanceof Error ? err.message : 'Failed to save');
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
});
