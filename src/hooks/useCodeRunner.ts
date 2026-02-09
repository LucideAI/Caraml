import { useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../services/api';
import { interpret } from '../interpreter';
import { isAbortError } from '../utils/errors';
import type { MemoryState } from '../types';

const EMPTY_MEMORY: MemoryState = { stack: [], heap: [], environment: [], typeDefinitions: [] };

/**
 * Shared hook that encapsulates the run-code logic used by IDEPage,
 * LearnOcamlExercisePage and SharedPage.
 *
 * @param getCode  – callback that returns the source code to execute
 *                   (called at run-time so it always reads the latest value)
 */
export function useCodeRunner(getCode: () => string | null) {
  const {
    setExecutionResult, setIsRunning, capabilities,
  } = useStore();

  const runAbortRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSeqRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runSeqRef.current += 1;
      if (runAbortRef.current) {
        runAbortRef.current.abort();
        runAbortRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsRunning(false);
    };
  }, [setIsRunning]);

  const handleRun = useCallback(async () => {
    const code = getCode();
    if (!code) return;

    // Cancel any in-flight run
    if (runAbortRef.current) {
      runAbortRef.current.abort();
      runAbortRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    const runSeq = ++runSeqRef.current;
    setIsRunning(true);

    const caps = useStore.getState().capabilities;

    let controller: AbortController | null = null;

    const finalizeIfCurrent = () => {
      if (runSeqRef.current === runSeq) {
        setIsRunning(false);
      }
    };

    const scheduleFallback = () => {
      fallbackTimerRef.current = setTimeout(() => {
        if (runSeqRef.current !== runSeq) return;
        try {
          const result = interpret(code);
          setExecutionResult(result);
        } catch (err: unknown) {
          if (runSeqRef.current !== runSeq) return;
          setExecutionResult({
            output: '',
            values: [],
            errors: [{ line: 0, column: 0, message: err instanceof Error ? err.message : 'Unknown error' }],
            memoryState: EMPTY_MEMORY,
            executionTimeMs: 0,
          });
        } finally {
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          finalizeIfCurrent();
        }
      }, 10);
    };

    try {
      if (caps.ocaml) {
        controller = new AbortController();
        runAbortRef.current = controller;
        const toplevelResult = await api.runToplevel(code, controller.signal);

        if (runAbortRef.current === controller) {
          runAbortRef.current = null;
        }
        if (runSeqRef.current !== runSeq) return;

        if (toplevelResult.backend) {
          // Also run the browser interpreter for memory visualization
          let memoryState: MemoryState = EMPTY_MEMORY;
          try {
            const localResult = interpret(code);
            memoryState = localResult.memoryState;
          } catch {
            // Memory visualization is best-effort
          }

          setExecutionResult({
            output: toplevelResult.output || '',
            values: toplevelResult.values || [],
            errors: toplevelResult.errors || [],
            memoryState,
            executionTimeMs: toplevelResult.executionTimeMs || 0,
          });
          finalizeIfCurrent();
          return;
        }
      }

      if (runSeqRef.current !== runSeq) return;
      scheduleFallback();
    } catch (err: unknown) {
      if (runAbortRef.current === controller) {
        runAbortRef.current = null;
      }
      if (isAbortError(err)) {
        return;
      }
      if (runSeqRef.current !== runSeq) return;
      scheduleFallback();
    }
  }, [getCode, setExecutionResult, setIsRunning]);

  return { handleRun };
}
