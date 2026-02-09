import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useStore } from '../store';
import { Header } from '../components/Header';
import { Editor } from '../components/Editor';
import { Console } from '../components/Console';
import { MemoryViewer } from '../components/MemoryViewer';
import { AuthModal } from '../components/AuthModal';
import { useCodeRunner } from '../hooks/useCodeRunner';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { IDELayout } from '../components/IDELayout';
import {
  Loader2, GitFork, User as UserIcon,
  PanelBottomClose, PanelBottomOpen, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import {
  computeAutoMemoryPanelWidth,
  PANEL_LIMITS,
} from '../utils/panelSizing';

export function SharedPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const {
    user, setCurrentProject, currentProject,
    showConsole, showMemoryPanel,
    isRunning,
    activeFile, setActiveFile,
    addNotification, capabilities, loadCapabilities,
    memoryState, memoryPanelWidth, memoryPanelWidthMode,
    setMemoryPanelWidth, persistPanelWidths,
    consoleHeight, setConsoleHeight,
    toggleConsole, toggleMemoryPanel,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isForking, setIsForking] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const panels = useMemo(() => [
    { kind: 'memory' as const, side: 'right' as const, width: memoryPanelWidth, setWidth: setMemoryPanelWidth, visible: showMemoryPanel },
  ], [memoryPanelWidth, showMemoryPanel, setMemoryPanelWidth]);

  const { getLayoutWidth, getMaxWidthForPanel, startResize } = useResizablePanel({
    layoutRef,
    panels,
    onResizeEnd: user ? persistPanelWidths : undefined,
  });

  const getCode = useCallback(() => {
    if (!currentProject || !activeFile) return null;
    return currentProject.files[activeFile]?.content || null;
  }, [currentProject, activeFile]);

  const { handleRun } = useCodeRunner(getCode);

  useEffect(() => { loadCapabilities(); }, [loadCapabilities]);

  useEffect(() => {
    if (!showMemoryPanel || memoryPanelWidthMode !== 'auto') return;
    setMemoryPanelWidth(computeAutoMemoryPanelWidth(memoryState), 'auto');
  }, [showMemoryPanel, memoryPanelWidthMode, memoryState, setMemoryPanelWidth]);

  useEffect(() => {
    const clampPanelToViewport = () => {
      if (!showMemoryPanel) return;
      const maxWidth = getMaxWidthForPanel('memory', getLayoutWidth());
      const minWidth = Math.min(PANEL_LIMITS.memory.min, maxWidth);
      if (memoryPanelWidth > maxWidth || memoryPanelWidth < minWidth) {
        setMemoryPanelWidth(Math.max(minWidth, Math.min(maxWidth, memoryPanelWidth)));
      }
    };

    clampPanelToViewport();
    window.addEventListener('resize', clampPanelToViewport);
    return () => window.removeEventListener('resize', clampPanelToViewport);
  }, [showMemoryPanel, memoryPanelWidth, getLayoutWidth, getMaxWidthForPanel, setMemoryPanelWidth]);

  useEffect(() => {
    if (!shareId) return;

    (async () => {
      try {
        const { project } = await api.getSharedProject(shareId);
        setCurrentProject(project);
        setAuthorName(project.author_name || 'Unknown');

        const firstFile = Object.keys(project.files)[0];
        if (firstFile) {
          useStore.setState({
            activeFile: firstFile,
            openTabs: [{ filename: firstFile, isModified: false }],
          });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Project not found');
      } finally {
        setIsLoading(false);
      }
    })();

    return () => setCurrentProject(null);
  }, [shareId]);

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
    } catch (err: unknown) {
      addNotification('error', err instanceof Error ? err.message : 'Failed to fork');
    } finally {
      setIsForking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-t-muted">Loading shared project...</p>
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
            <p className="text-lg text-t-muted mb-4">{error || 'Project not found'}</p>
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
      <Header
        mode="custom"
        renderLeft={
          <>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <span className="text-xl">🐫</span>
              <span className="font-bold text-base text-gradient hidden sm:block">Caraml</span>
            </div>
            <span className="text-t-ghost">/</span>
            <span className="text-sm font-medium text-t-secondary">{currentProject.name}</span>
            <span className="badge-info text-[10px]">Shared</span>
          </>
        }
        renderRight={
          <>
            <div className="flex items-center gap-1.5 text-xs text-t-faint">
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
            <div className="w-px h-6 bg-ide-border mx-1" />
            <button onClick={toggleConsole} className={`btn-icon ${showConsole ? 'text-brand-400' : ''}`} title="Toggle Console">
              {showConsole ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}
            </button>
            <button onClick={toggleMemoryPanel} className={`btn-icon ${showMemoryPanel ? 'text-brand-400' : ''}`} title="Toggle Memory">
              {showMemoryPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </>
        }
      />

      <IDELayout
        layoutRef={layoutRef}
        tabs={
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
        }
        editor={<Editor onRun={handleRun} />}
        console={<Console />}
        showConsole={showConsole}
        consoleHeight={consoleHeight}
        onConsoleHeightChange={setConsoleHeight}
        rightPanel={<MemoryViewer />}
        showRightPanel={showMemoryPanel}
        rightPanelWidth={memoryPanelWidth}
        onRightHandlePointerDown={startResize('memory')}
      />

      <AuthModal />
    </div>
  );
}
