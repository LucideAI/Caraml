import type { StateCreator } from 'zustand';
import type { ExecutionResult, MemoryState } from '../types';
import type { AppState } from './types';

export interface ExecutionSlice {
  executionResult: ExecutionResult | null;
  isRunning: boolean;
  memoryState: MemoryState | null;
  setExecutionResult: (result: ExecutionResult | null) => void;
  setIsRunning: (running: boolean) => void;
  setMemoryState: (state: MemoryState | null) => void;
}

export const createExecutionSlice: StateCreator<AppState, [], [], ExecutionSlice> = (set) => ({
  executionResult: null,
  isRunning: false,
  memoryState: null,
  setExecutionResult: (result) => set({ executionResult: result, memoryState: result?.memoryState || null }),
  setIsRunning: (running) => set({ isRunning: running }),
  setMemoryState: (state) => set({ memoryState: state }),
});
