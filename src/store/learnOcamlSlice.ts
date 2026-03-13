import type { StateCreator } from 'zustand';
import type {
  LearnOcamlConnection, LearnOcamlExerciseIndexEntry,
  LearnOcamlExercise, LearnOcamlExerciseGroup, LearnOcamlGradeResult,
} from '../types';
import type { AppState } from './types';
import { learnOcamlApi } from '../services/learnOcamlApi';
import { gradeWithWorker, cleanupGrader } from '../services/learnOcamlGrader';

export interface LearnOcamlSlice {
  learnOcaml: {
    connection: LearnOcamlConnection | null;
    isConnecting: boolean;
    isLoadingExercises: boolean;
    isLoadingExercise: boolean;
    isGrading: boolean;
    gradingProgress: string | null;
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
  learnOcamlRestoreConnection: () => Promise<void>;
}

export const createLearnOcamlSlice: StateCreator<AppState, [], [], LearnOcamlSlice> = (set, get) => ({
  learnOcaml: {
    connection: null,
    isConnecting: false,
    isLoadingExercises: false,
    isLoadingExercise: false,
    isGrading: false,
    gradingProgress: null,
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
    } catch (err: unknown) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isConnecting: false } }));
      throw err;
    }
  },

  learnOcamlDisconnect: () => {
    learnOcamlApi.disconnect();
    cleanupGrader();
    set((s) => ({
      learnOcaml: {
        ...s.learnOcaml,
        connection: null,
        exercises: [],
        grades: {},
        currentExercise: null,
        lastGradeResult: null,
        gradingProgress: null,
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
    } catch (err: unknown) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercises: false } }));
      get().addNotification('error', `Failed to load exercises: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },

  learnOcamlLoadExercise: async (id) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercise: true, currentExercise: null, lastGradeResult: null } }));
    try {
      const exercise = await learnOcamlApi.getExercise(id);
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          currentExercise: exercise as any,
          isLoadingExercise: false,
        },
      }));
    } catch (err: unknown) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isLoadingExercise: false } }));
      get().addNotification('error', `Failed to load exercise: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },

  learnOcamlSyncAnswer: async (exerciseId, code) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: true } }));
    try {
      await learnOcamlApi.updateExerciseAnswer(exerciseId, code);
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: false } }));
    } catch (err: unknown) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isSyncing: false } }));
      get().addNotification('error', `Failed to sync: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },

  learnOcamlGrade: async (exerciseId, code) => {
    const conn = get().learnOcaml.connection;
    if (!conn) {
      get().addNotification('error', 'Not connected to Learn OCaml');
      throw new Error('Not connected to Learn OCaml');
    }

    set((s) => ({ learnOcaml: { ...s.learnOcaml, isGrading: true, gradingProgress: 'Starting...' } }));

    try {
      // First, sync the code so it's saved regardless of grading outcome
      try {
        await learnOcamlApi.updateExerciseAnswer(exerciseId, code);
      } catch {
        // Sync failure is non-fatal for grading
      }

      // Use client-side Web Worker grading
      const result = await gradeWithWorker(
        conn.serverUrl,
        conn.token,
        exerciseId,
        code,
        (progress) => {
          set((s) => ({ learnOcaml: { ...s.learnOcaml, gradingProgress: progress } }));
        },
        90_000, // 90 second timeout
      );

      const updatedGrades = { ...get().learnOcaml.grades };
      if (result.grade !== null && result.grade !== undefined) {
        updatedGrades[exerciseId] = result.grade;
      }
      set((s) => ({
        learnOcaml: {
          ...s.learnOcaml,
          isGrading: false,
          gradingProgress: null,
          lastGradeResult: result,
          grades: updatedGrades,
        },
      }));
      if (result.grade !== null && result.grade !== undefined) {
        get().addNotification(
          result.grade >= (result.max_grade || 100) ? 'success' : result.grade > 0 ? 'warning' : 'error',
          `Grade: ${result.grade}/${result.max_grade}`
        );
      } else if (result.report.length > 0) {
        get().addNotification('info', 'Grading complete — see report for details.');
      }

      // Also sync the grade back to Learn OCaml server
      try {
        await learnOcamlApi.gradeExercise(exerciseId, code);
      } catch {
        // Non-critical — grade was computed locally
      }

      return result;
    } catch (err: unknown) {
      set((s) => ({ learnOcaml: { ...s.learnOcaml, isGrading: false, gradingProgress: null } }));
      get().addNotification('error', `Grading failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  },

  setShowLearnOcamlModal: (show) => {
    set((s) => ({ learnOcaml: { ...s.learnOcaml, showConnectModal: show } }));
  },

  learnOcamlRestoreConnection: async () => {
    const conn = learnOcamlApi.getConnection();
    if (conn) {
      // Optimistically restore the connection for fast UI
      set((s) => ({ learnOcaml: { ...s.learnOcaml, connection: conn } }));
      // Re-validate the token against the server
      try {
        await learnOcamlApi.connect(conn.serverUrl, conn.token);
      } catch {
        // Token is no longer valid — clear the stored connection
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
        get().addNotification('warning', 'Learn OCaml session expired or token is invalid. Please reconnect.');
      }
    }
  },
});
