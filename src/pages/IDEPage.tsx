import { useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../services/api';
import { Header } from '../components/Header';
import { Editor } from '../components/Editor';
import { Console } from '../components/Console';
import { MemoryViewer } from '../components/MemoryViewer';
import { FileTree } from '../components/FileTree';
import { AuthModal } from '../components/AuthModal';
import { ShareModal } from '../components/ShareModal';
import { interpret } from '../interpreter';
import { Loader2, X } from 'lucide-react';
import {
  computeAutoFileTreeWidth,
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

export function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    user, currentProject, isProjectLoading, loadProject,
    activeFile, openTabs, setActiveFile, closeTab,
    showFileTree, showConsole, showMemoryPanel,
    setExecutionResult, setIsRunning, isRunning,
    isDirty, saveProject, capabilities, loadCapabilities,
    addNotification, memoryState,
    fileTreeWidth, memoryPanelWidth, fileTreeWidthMode, memoryPanelWidthMode,
    setFileTreeWidth, setMemoryPanelWidth, persistPanelWidths,
  } = useStore();
  const authUserId = user?.id ?? null;
  const currentProjectId = currentProject?.id ?? null;
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ panel: 'fileTree' | 'memory'; startX: number; startWidth: number } | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSeqRef = useRef(0);
  const fileNames = currentProject ? Object.keys(currentProject.files).sort() : [];
  const fileNamesKey = fileNames.join('\u0000');

  const getLayoutWidth = useCallback(() => {
    return layoutRef.current?.clientWidth ?? window.innerWidth;
  }, []);

  const getMaxWidthForPanel = useCallback((panel: 'fileTree' | 'memory', totalWidth?: number) => {
    const width = totalWidth ?? getLayoutWidth();
    const visibleHandles = (showFileTree ? 1 : 0) + (showMemoryPanel ? 1 : 0);
    const handleSpace = visibleHandles * RESIZE_HANDLE_WIDTH;

    if (panel === 'fileTree') {
      const occupiedRight = (showMemoryPanel ? memoryPanelWidth : 0) + EDITOR_MIN_WIDTH + handleSpace;
      return Math.max(0, Math.min(PANEL_LIMITS.fileTree.max, width - occupiedRight));
    }

    const occupiedLeft = (showFileTree ? fileTreeWidth : 0) + EDITOR_MIN_WIDTH + handleSpace;
    return Math.max(0, Math.min(PANEL_LIMITS.memory.max, width - occupiedLeft));
  }, [fileTreeWidth, memoryPanelWidth, showFileTree, showMemoryPanel, getLayoutWidth]);

  const startResize = useCallback((panel: 'fileTree' | 'memory') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startWidth = panel === 'fileTree' ? fileTreeWidth : memoryPanelWidth;
    dragStateRef.current = { panel, startX: e.clientX, startWidth };

    if (panel === 'fileTree') {
      setFileTreeWidth(startWidth, 'manual');
    } else {
      setMemoryPanelWidth(startWidth, 'manual');
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      if (dragState.panel === 'fileTree') {
        const maxWidth = getMaxWidthForPanel('fileTree');
        const minWidth = Math.min(PANEL_LIMITS.fileTree.min, maxWidth);
        const nextWidth = dragState.startWidth + (event.clientX - dragState.startX);
        setFileTreeWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
      } else {
        const maxWidth = getMaxWidthForPanel('memory');
        const minWidth = Math.min(PANEL_LIMITS.memory.min, maxWidth);
        const nextWidth = dragState.startWidth - (event.clientX - dragState.startX);
        setMemoryPanelWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
      }
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      void persistPanelWidths();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [
    fileTreeWidth,
    memoryPanelWidth,
    setFileTreeWidth,
    setMemoryPanelWidth,
    getMaxWidthForPanel,
    persistPanelWidths,
  ]);

  // Load project + capabilities
  useEffect(() => {
    loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    if (projectId && authUserId) {
      if (currentProjectId !== projectId) {
        loadProject(projectId);
      }
    } else if (!authUserId) {
      useStore.getState().setShowAuthModal(true);
    }
  }, [projectId, authUserId, currentProjectId, loadProject]);

  // Auto-save
  useEffect(() => {
    if (isDirty && user) {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(() => {
        saveProject();
      }, 30000);
    }
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [isDirty, user, saveProject]);

  useEffect(() => {
    if (!showFileTree || fileTreeWidthMode !== 'auto') return;
    setFileTreeWidth(computeAutoFileTreeWidth(fileNames), 'auto');
  }, [showFileTree, fileTreeWidthMode, fileNamesKey, setFileTreeWidth]);

  useEffect(() => {
    if (!showMemoryPanel || memoryPanelWidthMode !== 'auto') return;
    setMemoryPanelWidth(computeAutoMemoryPanelWidth(memoryState), 'auto');
  }, [showMemoryPanel, memoryPanelWidthMode, memoryState, setMemoryPanelWidth]);

  useEffect(() => {
    const clampPanelsToViewport = () => {
      const layoutWidth = getLayoutWidth();
      if (showFileTree) {
        const maxWidth = getMaxWidthForPanel('fileTree', layoutWidth);
        const minWidth = Math.min(PANEL_LIMITS.fileTree.min, maxWidth);
        if (fileTreeWidth > maxWidth || fileTreeWidth < minWidth) {
          setFileTreeWidth(Math.max(minWidth, Math.min(maxWidth, fileTreeWidth)));
        }
      }
      if (showMemoryPanel) {
        const maxWidth = getMaxWidthForPanel('memory', layoutWidth);
        const minWidth = Math.min(PANEL_LIMITS.memory.min, maxWidth);
        if (memoryPanelWidth > maxWidth || memoryPanelWidth < minWidth) {
          setMemoryPanelWidth(Math.max(minWidth, Math.min(maxWidth, memoryPanelWidth)));
        }
      }
    };

    clampPanelsToViewport();
    window.addEventListener('resize', clampPanelsToViewport);
    return () => window.removeEventListener('resize', clampPanelsToViewport);
  }, [
    showFileTree,
    showMemoryPanel,
    fileTreeWidth,
    memoryPanelWidth,
    getLayoutWidth,
    getMaxWidthForPanel,
    setFileTreeWidth,
    setMemoryPanelWidth,
  ]);

  // ── Run: Use real OCaml backend if available, fallback to browser interpreter
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
            output: '',
            values: [],
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
          // Also run the browser interpreter for memory visualization
          let memoryState: import('../types').MemoryState = { stack: [], heap: [], environment: [], typeDefinitions: [] };
          try {
            const localResult = interpret(file.content);
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
  }, [currentProject, activeFile, setExecutionResult, setIsRunning, capabilities]);

  // ── Format: Use ocamlformat if available
  const handleFormat = useCallback(async () => {
    if (!currentProject || !activeFile || !capabilities.ocamlformat) return;
    const file = currentProject.files[activeFile];
    if (!file) return;

    try {
      const result = await api.formatCode(file.content);
      if (result.formatted) {
        useStore.getState().updateFileContent(activeFile, result.formatted);
        addNotification('success', 'Code formatted with ocamlformat');
      }
    } catch (err: any) {
      addNotification('error', `Format failed: ${err.message}`);
    }
  }, [currentProject, activeFile, capabilities, addNotification]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target instanceof HTMLElement ? e.target : null;
      const insideMonaco = !!target?.closest('.monaco-editor');

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (insideMonaco) return;
        e.preventDefault();
        void handleRun();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveProject();
        return;
      }
      // Ctrl+Shift+F = format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        void handleFormat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun, saveProject, handleFormat]);

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

  if (isProjectLoading && (!currentProject || currentProject.id !== projectId)) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-slate-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="h-screen flex flex-col bg-ide-bg">
        <Header mode="ide" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-slate-400 mb-4">
              {user ? 'Project not found' : 'Please sign in to open projects'}
            </p>
            {user ? (
              <button onClick={() => navigate('/')} className="btn-primary">
                Back to Dashboard
              </button>
            ) : (
              <button onClick={() => useStore.getState().setShowAuthModal(true)} className="btn-primary">
                Sign In
              </button>
            )}
          </div>
        </div>
        <AuthModal />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-ide-bg overflow-hidden">
      <Header mode="ide" onRun={handleRun} onFormat={handleFormat} />

      <div ref={layoutRef} className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        {showFileTree && (
          <>
            <div style={{ width: `${fileTreeWidth}px` }} className="shrink-0 border-r border-ide-border overflow-hidden">
              <FileTree />
            </div>
            <div
              className="resize-handle w-1.5 shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none"
              onPointerDown={startResize('fileTree')}
            />
          </>
        )}

        {/* Main Editor + Console Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Editor Tabs */}
          <div className="flex items-center bg-ide-sidebar border-b border-ide-border overflow-x-auto shrink-0">
            {openTabs.map((tab) => (
              <div
                key={tab.filename}
                className={`tab whitespace-nowrap ${
                  activeFile === tab.filename ? 'tab-active' : ''
                }`}
                onClick={() => setActiveFile(tab.filename)}
              >
                <span className="text-xs">{tab.filename}</span>
                {tab.isModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.filename); }}
                  className="ml-1 p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Editor + Console Split */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor */}
            <div className={`${showConsole ? 'flex-1 min-h-0' : 'flex-1'} overflow-hidden`}>
              <Editor onRun={handleRun} />
            </div>

            {/* Console */}
            {showConsole && (
              <div className="h-64 shrink-0 border-t border-ide-border overflow-hidden">
                <Console />
              </div>
            )}
          </div>
        </div>

        {/* Memory Viewer Sidebar */}
        {showMemoryPanel && (
          <>
            <div
              className="resize-handle w-1.5 shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none"
              onPointerDown={startResize('memory')}
            />
            <div style={{ width: `${memoryPanelWidth}px` }} className="shrink-0 border-l border-ide-border overflow-hidden">
              <MemoryViewer />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <AuthModal />
      <ShareModal />
    </div>
  );
}

