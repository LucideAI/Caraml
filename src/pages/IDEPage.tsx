import { useEffect, useCallback, useRef, useMemo } from 'react';
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
import { useCodeRunner } from '../hooks/useCodeRunner';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { IDELayout } from '../components/IDELayout';
import { Loader2, X } from 'lucide-react';
import {
  computeAutoFileTreeWidth,
  computeAutoMemoryPanelWidth,
  PANEL_LIMITS,
} from '../utils/panelSizing';

export function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    user, currentProject, isProjectLoading, loadProject,
    activeFile, openTabs, setActiveFile, closeTab,
    showFileTree, showConsole, showMemoryPanel,
    isRunning,
    isDirty, saveProject, capabilities, loadCapabilities,
    addNotification, memoryState,
    fileTreeWidth, memoryPanelWidth, fileTreeWidthMode, memoryPanelWidthMode,
    setFileTreeWidth, setMemoryPanelWidth, persistPanelWidths,
    consoleHeight, setConsoleHeight,
  } = useStore();
  const authUserId = user?.id ?? null;
  const currentProjectId = currentProject?.id ?? null;
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const fileNames = currentProject ? Object.keys(currentProject.files).sort() : [];
  const fileNamesKey = fileNames.join('\u0000');

  const panels = useMemo(() => [
    { kind: 'fileTree' as const, side: 'left' as const, width: fileTreeWidth, setWidth: setFileTreeWidth, visible: showFileTree },
    { kind: 'memory' as const, side: 'right' as const, width: memoryPanelWidth, setWidth: setMemoryPanelWidth, visible: showMemoryPanel },
  ], [fileTreeWidth, memoryPanelWidth, showFileTree, showMemoryPanel, setFileTreeWidth, setMemoryPanelWidth]);

  const { getLayoutWidth, getMaxWidthForPanel, startResize } = useResizablePanel({
    layoutRef,
    panels,
    onResizeEnd: persistPanelWidths,
  });

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

  const getCode = useCallback(() => {
    if (!currentProject || !activeFile) return null;
    return currentProject.files[activeFile]?.content || null;
  }, [currentProject, activeFile]);

  const { handleRun } = useCodeRunner(getCode);

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
    } catch (err: unknown) {
      addNotification('error', `Format failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  if (isProjectLoading && (!currentProject || currentProject.id !== projectId)) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-t-muted">Loading project...</p>
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
            <p className="text-lg text-t-muted mb-4">
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

      <IDELayout
        layoutRef={layoutRef}
        leftPanel={<FileTree />}
        showLeftPanel={showFileTree}
        leftPanelWidth={fileTreeWidth}
        onLeftHandlePointerDown={startResize('fileTree')}
        rightPanel={<MemoryViewer />}
        showRightPanel={showMemoryPanel}
        rightPanelWidth={memoryPanelWidth}
        onRightHandlePointerDown={startResize('memory')}
        tabs={
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
                  className="ml-1 p-0.5 rounded hover:bg-ide-hover text-t-faint hover:text-t-secondary"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        }
        editor={<Editor onRun={handleRun} />}
        console={<Console />}
        showConsole={showConsole}
        consoleHeight={consoleHeight}
        onConsoleHeightChange={setConsoleHeight}
      />

      {/* Modals */}
      <AuthModal />
      <ShareModal />
    </div>
  );
}

