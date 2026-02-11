import { useEffect, useState, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useStore } from '../store';
import { Header } from '../components/Header';
import { Editor } from '../components/Editor';
import { Console } from '../components/Console';
import { MemoryViewer } from '../components/MemoryViewer';
import { AuthModal } from '../components/AuthModal';
import { interpret } from '../interpreter';
import { Loader2, GitFork, User as UserIcon } from 'lucide-react';
import {
  computeAutoMemoryPanelWidth,
  EDITOR_MIN_WIDTH,
  PANEL_LIMITS,
  RESIZE_HANDLE_WIDTH,
} from '../utils/panelSizing';

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return (error as { name?: string }).name === 'AbortError';
  }
  return false;
}

export function SharedPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const {
    user, setCurrentProject, currentProject,
    showConsole, showMemoryPanel,
    setExecutionResult, setIsRunning, isRunning,
    activeFile, setActiveFile,
    addNotification, capabilities, loadCapabilities,
    memoryState, memoryPanelWidth, memoryPanelWidthMode,
    setMemoryPanelWidth, persistPanelWidths,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isForking, setIsForking] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSeqRef = useRef(0);

  const getLayoutWidth = useCallback(() => {
    return layoutRef.current?.clientWidth ?? window.innerWidth;
  }, []);

  const getMaxMemoryWidth = useCallback((totalWidth?: number) => {
    const width = totalWidth ?? getLayoutWidth();
    const visibleHandles = showMemoryPanel ? 1 : 0;
    const handleSpace = visibleHandles * RESIZE_HANDLE_WIDTH;
    return Math.max(0, Math.min(PANEL_LIMITS.memory.max, width - EDITOR_MIN_WIDTH - handleSpace));
  }, [showMemoryPanel, getLayoutWidth]);

  const startResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: memoryPanelWidth };
    setMemoryPanelWidth(memoryPanelWidth, 'manual');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const maxWidth = getMaxMemoryWidth();
      const minWidth = Math.min(PANEL_LIMITS.memory.min, maxWidth);
      const nextWidth = dragState.startWidth - (event.clientX - dragState.startX);
      setMemoryPanelWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (user) {
        void persistPanelWidths();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [memoryPanelWidth, setMemoryPanelWidth, getMaxMemoryWidth, persistPanelWidths, user]);

  useEffect(() => { loadCapabilities(); }, [loadCapabilities]);

  useEffect(() => {
    if (!showMemoryPanel || memoryPanelWidthMode !== 'auto') return;
    setMemoryPanelWidth(computeAutoMemoryPanelWidth(memoryState), 'auto');
  }, [showMemoryPanel, memoryPanelWidthMode, memoryState, setMemoryPanelWidth]);

  useEffect(() => {
    const clampPanelToViewport = () => {
      if (!showMemoryPanel) return;
      const maxWidth = getMaxMemoryWidth(getLayoutWidth());
      const minWidth = Math.min(PANEL_LIMITS.memory.min, maxWidth);
      if (memoryPanelWidth > maxWidth || memoryPanelWidth < minWidth) {
        setMemoryPanelWidth(Math.max(minWidth, Math.min(maxWidth, memoryPanelWidth)));
      }
    };

    clampPanelToViewport();
    window.addEventListener('resize', clampPanelToViewport);
    return () => window.removeEventListener('resize', clampPanelToViewport);
  }, [showMemoryPanel, memoryPanelWidth, getLayoutWidth, getMaxMemoryWidth, setMemoryPanelWidth]);

  useEffect(() => {
    if (!shareId) return;

    (async () => {
      try {
        const { project } = await api.getSharedProject(shareId);
        setCurrentProject(project);
        setAuthorName(project.author_name);

        const firstFile = Object.keys(project.files)[0];
        if (firstFile) {
          useStore.setState({
            activeFile: firstFile,
            openTabs: [{ filename: firstFile, isModified: false }],
          });
        }
      } catch (err: any) {
        setError(err.message || 'Project not found');
      } finally {
        setIsLoading(false);
      }
    })();

    return () => setCurrentProject(null);
  }, [shareId]);

  const handleRun = useCallback(async () => {
    if (!currentProject || !activeFile) return;
    const file = currentProject.files[activeFile];
    if (!file) return;

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
          const result = interpret(file.content);
          setExecutionResult(result);
        } catch (err: any) {
          if (runSeqRef.current !== runSeq) return;
          setExecutionResult({
            output: '', values: [],
            errors: [{ line: 0, column: 0, message: err.message || 'Unknown error' }],
            memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
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
      if (capabilities.ocaml) {
        controller = new AbortController();
        runAbortRef.current = controller;
        const toplevelResult = await api.runToplevel(file.content, controller.signal);

        if (runAbortRef.current === controller) {
          runAbortRef.current = null;
        }
        if (runSeqRef.current !== runSeq) return;

        if (toplevelResult.backend) {
          let memoryState: import('../types').MemoryState = { stack: [], heap: [], environment: [], typeDefinitions: [] };
          try {
            const localResult = interpret(file.content);
            memoryState = localResult.memoryState;
          } catch {}
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
  }, [currentProject, activeFile, capabilities, setExecutionResult, setIsRunning]);

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

  const handleFork = async () => {
    if (!user) {
      useStore.getState().setShowAuthModal(true);
      return;
    }
    if (!shareId) return;

    setIsForking(true);
    try {
      const { project } = await api.forkProject(shareId);
      addNotification('success', 'Project forked to your account!');
      navigate(`/ide/${project.id}`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to fork');
    } finally {
      setIsForking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-slate-400">Loading shared project...</p>
        </div>
      </div>
    );
  }

  if (error || !currentProject) {
    return (
      <div className="h-screen flex flex-col bg-ide-bg">
        <Header mode="shared" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-slate-400 mb-4">{error || 'Project not found'}</p>
            <button onClick={() => navigate('/')} className="btn-primary">
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-ide-bg overflow-hidden">
      {/* Custom header for shared view */}
      <header className="h-12 flex items-center justify-between px-3 bg-ide-sidebar border-b border-ide-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-xl">🐫</span>
            <span className="font-bold text-base text-gradient hidden sm:block">Caraml</span>
          </div>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-medium text-slate-300">{currentProject.name}</span>
          <span className="badge-info text-[10px]">Shared</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <UserIcon size={12} />
            <span>by {authorName}</span>
          </div>

          <button onClick={handleRun} disabled={isRunning} className="btn-primary btn-sm">
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : '▶'}
            Run
          </button>

          <button onClick={handleFork} disabled={isForking} className="btn-secondary btn-sm">
            {isForking ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />}
            Fork
          </button>
        </div>
      </header>

      <div ref={layoutRef} className="flex-1 flex overflow-hidden">
        {/* Main editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div className="flex items-center bg-ide-sidebar border-b border-ide-border overflow-x-auto shrink-0">
            {Object.keys(currentProject.files).map((filename) => (
              <div
                key={filename}
                className={`tab whitespace-nowrap ${activeFile === filename ? 'tab-active' : ''}`}
                onClick={() => setActiveFile(filename)}
              >
                <span className="text-xs">{filename}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className={`${showConsole ? 'flex-1 min-h-0' : 'flex-1'}`}>
              <Editor onRun={handleRun} />
            </div>
            {showConsole && (
              <div className="h-64 shrink-0 border-t border-ide-border">
                <Console />
              </div>
            )}
          </div>
        </div>

        {showMemoryPanel && (
          <>
            <div
              className="resize-handle w-1.5 shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none"
              onPointerDown={startResize}
            />
            <div style={{ width: `${memoryPanelWidth}px` }} className="shrink-0 border-l border-ide-border overflow-hidden">
              <MemoryViewer />
            </div>
          </>
        )}
      </div>

      <AuthModal />
    </div>
  );
}
