import { useEffect, useCallback, useRef } from 'react';
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

export function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    user, currentProject, isProjectLoading, loadProject,
    activeFile, openTabs, setActiveFile, closeTab,
    showFileTree, showConsole, showMemoryPanel,
    setExecutionResult, setIsRunning, isRunning,
    isDirty, saveProject, capabilities, loadCapabilities,
    addNotification,
  } = useStore();
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project + capabilities
  useEffect(() => {
    loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    if (projectId && user) {
      loadProject(projectId);
    } else if (!user) {
      useStore.getState().setShowAuthModal(true);
    }
  }, [projectId, user, loadProject]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
      // Ctrl+Shift+F = format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        handleFormat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProject, activeFile, capabilities]);

  // ── Run: Use real OCaml backend if available, fallback to browser interpreter
  const handleRun = useCallback(async () => {
    if (!currentProject || !activeFile || isRunning) return;
    const file = currentProject.files[activeFile];
    if (!file) return;

    setIsRunning(true);

    try {
      if (capabilities.ocaml) {
        // Use real OCaml toplevel via backend
        const toplevelResult = await api.runToplevel(file.content);

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
          setIsRunning(false);
          return;
        }
      }

      // Fallback: browser-based interpreter
      setTimeout(() => {
        try {
          const result = interpret(file.content);
          setExecutionResult(result);
        } catch (err: any) {
          setExecutionResult({
            output: '',
            values: [],
            errors: [{ line: 0, column: 0, message: err.message || 'Unknown error' }],
            memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
            executionTimeMs: 0,
          });
        } finally {
          setIsRunning(false);
        }
      }, 10);
    } catch (err: any) {
      // Network error or backend issue — fallback to local
      try {
        const result = interpret(file.content);
        setExecutionResult(result);
      } catch (localErr: any) {
        setExecutionResult({
          output: '',
          values: [],
          errors: [{ line: 0, column: 0, message: localErr.message || 'Unknown error' }],
          memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
          executionTimeMs: 0,
        });
      }
      setIsRunning(false);
    }
  }, [currentProject, activeFile, isRunning, setExecutionResult, setIsRunning, capabilities]);

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

  if (isProjectLoading) {
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

      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        {showFileTree && (
          <div className="w-52 shrink-0 border-r border-ide-border">
            <FileTree />
          </div>
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
          <div className="w-72 shrink-0 border-l border-ide-border overflow-hidden">
            <MemoryViewer />
          </div>
        )}
      </div>

      {/* Modals */}
      <AuthModal />
      <ShareModal />
    </div>
  );
}
