import { useEffect, useState, useCallback } from 'react';
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
import type { Project } from '../types';

export function SharedPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const {
    user, setCurrentProject, currentProject,
    showConsole, showMemoryPanel,
    setExecutionResult, setIsRunning, isRunning,
    activeFile, openTabs, setActiveFile,
    addNotification, capabilities, loadCapabilities,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isForking, setIsForking] = useState(false);

  useEffect(() => { loadCapabilities(); }, [loadCapabilities]);

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
    if (!currentProject || !activeFile || isRunning) return;
    const file = currentProject.files[activeFile];
    if (!file) return;

    setIsRunning(true);
    try {
      if (capabilities.ocaml) {
        const toplevelResult = await api.runToplevel(file.content);
        if (toplevelResult.backend) {
          let memoryState: import('../types').MemoryState = { stack: [], heap: [], environment: [], typeDefinitions: [] };
          try { const lr = interpret(file.content); memoryState = lr.memoryState; } catch {}
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
    } catch {}

    // Fallback to browser
    setTimeout(() => {
      try {
        const result = interpret(file.content);
        setExecutionResult(result);
      } catch (err: any) {
        setExecutionResult({
          output: '', values: [],
          errors: [{ line: 0, column: 0, message: err.message }],
          memoryState: { stack: [], heap: [], environment: [], typeDefinitions: [] },
          executionTimeMs: 0,
        });
      } finally { setIsRunning(false); }
    }, 10);
  }, [currentProject, activeFile, isRunning, capabilities]);

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

      <div className="flex-1 flex overflow-hidden">
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
          <div className="w-72 shrink-0 border-l border-ide-border">
            <MemoryViewer />
          </div>
        )}
      </div>

      <AuthModal />
    </div>
  );
}
