import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { useStore } from '../store';
import { Console } from '../components/Console';
import { Header } from '../components/Header';
import { MemoryViewer } from '../components/MemoryViewer';
import { IDELayout } from '../components/IDELayout';
import { api } from '../services/api';
import { registerOcamlLanguage } from '../components/Editor';
import { useCodeRunner } from '../hooks/useCodeRunner';
import { useResizablePanel } from '../hooks/useResizablePanel';
import {
  DEFAULT_DESCRIPTION_WIDTH,
  PANEL_LIMITS,
} from '../utils/panelSizing';
import {
  ArrowLeft, Loader2, Play, CheckCircle2, AlertCircle,
  GraduationCap, FileText, Code, Upload, Trophy,
  ChevronDown, ChevronUp, Clock, UploadCloud,
  PanelBottomClose, PanelBottomOpen, PanelRightClose, PanelRightOpen,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

export function LearnOcamlExercisePage() {
  const params = useParams();
  // Exercise IDs contain slashes (e.g. "tp1/lists"), so we use wildcard route
  const decodedId = params['*'] || '';
  const navigate = useNavigate();
  const {
    learnOcaml, learnOcamlLoadExercise, learnOcamlSyncAnswer, learnOcamlGrade,
    isRunning,
    capabilities, loadCapabilities, addNotification,
    editorFontSize, consoleFontSize,
    showMemoryPanel, memoryPanelWidth, setMemoryPanelWidth,
    consoleHeight, setConsoleHeight,
  } = useStore();

  const [code, setCode] = useState('');
  const [showDescription, setShowDescription] = useState(true);
  const [showPrelude, setShowPrelude] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [showGradePanel, setShowGradePanel] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [descriptionWidth, setDescriptionWidth] = useState(DEFAULT_DESCRIPTION_WIDTH);
  const [descSplitRatio, setDescSplitRatio] = useState(0.5);
  const descSplitDragRef = useRef<{ startY: number; startRatio: number; panelHeight: number } | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const autoSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSetInitialCode = useRef(false);
  const codeRef = useRef(code);
  codeRef.current = code;
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const panels = useMemo(() => [
    { kind: 'description' as const, side: 'left' as const, width: descriptionWidth, setWidth: (w: number) => setDescriptionWidth(w), visible: showDescription },
    { kind: 'memory' as const, side: 'right' as const, width: memoryPanelWidth, setWidth: setMemoryPanelWidth, visible: showMemoryPanel },
  ], [descriptionWidth, showDescription, memoryPanelWidth, showMemoryPanel, setMemoryPanelWidth]);

  const { startResize } = useResizablePanel({ layoutRef, panels });

  const startDescSplitResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const panelHeight = leftPanelRef.current?.clientHeight ?? 400;
    descSplitDragRef.current = { startY: e.clientY, startRatio: descSplitRatio, panelHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const drag = descSplitDragRef.current;
      if (!drag) return;
      const delta = event.clientY - drag.startY;
      const ratioDelta = delta / drag.panelHeight;
      const next = Math.min(0.85, Math.max(0.15, drag.startRatio + ratioDelta));
      setDescSplitRatio(next);
    };

    const handlePointerUp = () => {
      descSplitDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [descSplitRatio]);

  const exercise = learnOcaml.currentExercise;
  const gradeResult = learnOcaml.lastGradeResult;

  // Load exercise
  useEffect(() => {
    loadCapabilities();
    if (decodedId) {
      hasSetInitialCode.current = false;
      learnOcamlLoadExercise(decodedId);
    }
  }, [decodedId]);

  // Set initial code from exercise data
  useEffect(() => {
    if (exercise && !hasSetInitialCode.current) {
      // Use the user's saved answer if available, otherwise use the template
      const initialCode = (exercise as any).userAnswer || exercise.template || '';
      setCode(initialCode);
      hasSetInitialCode.current = true;
    }
  }, [exercise]);

  // Auto-sync on code change (debounced 10 seconds)
  useEffect(() => {
    if (!decodedId || !code || !hasSetInitialCode.current) return;
    if (autoSyncRef.current) clearTimeout(autoSyncRef.current);
    autoSyncRef.current = setTimeout(() => {
      handleSync(false);
    }, 10000);
    return () => {
      if (autoSyncRef.current) clearTimeout(autoSyncRef.current);
    };
  }, [code]);

  // ── Run Code ───────────────────────────────────────────────────────────

  const getCode = useCallback(() => {
    const c = codeRef.current;
    if (!c) return null;
    const ex = useStore.getState().learnOcaml.currentExercise;
    return ex?.prelude
      ? `${ex.prelude}\n\n(* === Your code === *)\n${c}`
      : c;
  }, []);

  const { handleRun } = useCodeRunner(getCode);

  // ── Sync to Learn OCaml ────────────────────────────────────────────────

  const handleSync = useCallback(async (showNotification = true) => {
    if (!decodedId || !code) return;
    setIsSaving(true);
    try {
      await learnOcamlSyncAnswer(decodedId, code);
      setLastSyncTime(new Date());
      if (showNotification) {
        addNotification('success', 'Code synced to Learn OCaml');
      }
    } catch {
      // Error is handled in store
    } finally {
      setIsSaving(false);
    }
  }, [decodedId, code]);

  // ── Grade Exercise ─────────────────────────────────────────────────────

  const handleGrade = useCallback(async () => {
    if (!decodedId || !code || learnOcaml.isGrading) return;
    try {
      await learnOcamlGrade(decodedId, code);
      setShowGradePanel(true);
    } catch {
      // Error handled in store
    }
  }, [decodedId, code, learnOcaml.isGrading]);

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
        void handleSync(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        void handleGrade();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun, handleSync, handleGrade]);

  // ── Loading State ──────────────────────────────────────────────────────

  if (learnOcaml.isLoadingExercise || !exercise) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-t-muted">Loading exercise...</p>
        </div>
      </div>
    );
  }

  const currentGrade = learnOcaml.grades[decodedId] ?? exercise.grade ?? null;

  return (
    <div className="h-screen flex flex-col bg-ide-bg overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Header
        mode="custom"
        renderLeft={
          <>
            <button onClick={() => navigate('/learn-ocaml')} className="btn-icon" title="Back to exercises">
              <ArrowLeft size={18} />
            </button>
            <GraduationCap size={18} className="text-orange-400" />
            <span className="text-sm font-medium text-t-secondary truncate max-w-[300px]">
              {exercise.title || decodedId}
            </span>
            {currentGrade !== null && currentGrade !== undefined && (
              <span
                className={`badge ${
                  currentGrade >= 100
                    ? 'badge-success'
                    : currentGrade > 0
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'badge-error'
                }`}
              >
                {Math.round(currentGrade)}%
              </span>
            )}
            {isSaving && (
              <span className="flex items-center gap-1 text-xs text-brand-400">
                <UploadCloud size={12} className="animate-pulse" />
                Syncing...
              </span>
            )}
          </>
        }
        renderCenter={
          <>
            <button onClick={handleRun} disabled={isRunning} className="btn-primary btn-sm gap-1.5" title="Run (Ctrl+Enter)">
              {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              <span className="hidden sm:inline">Run</span>
            </button>
            <button onClick={() => handleSync(true)} disabled={isSaving} className="btn-secondary btn-sm gap-1.5" title="Sync to Learn OCaml (Ctrl+S)">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span className="hidden sm:inline">Sync</span>
            </button>
            <button
              onClick={handleGrade}
              disabled={learnOcaml.isGrading}
              className="btn btn-sm gap-1.5 bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500 shadow-lg shadow-orange-500/20"
              title="Grade (Ctrl+Shift+G)"
            >
              {learnOcaml.isGrading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trophy size={14} />
              )}
              <span className="hidden sm:inline">Grade</span>
            </button>
            <div className="w-px h-6 bg-ide-border mx-1" />
            <button
              onClick={() => setShowDescription(!showDescription)}
              className={`btn-icon ${showDescription ? 'text-brand-400' : ''}`}
              title="Toggle Description"
            >
              {showDescription ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <button
              onClick={() => setShowConsole(!showConsole)}
              className={`btn-icon ${showConsole ? 'text-brand-400' : ''}`}
              title="Toggle Console"
            >
              {showConsole ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}
            </button>
            <button
              onClick={() => useStore.getState().toggleMemoryPanel()}
              className={`btn-icon ${showMemoryPanel ? 'text-brand-400' : ''}`}
              title="Toggle Memory"
            >
              {showMemoryPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </>
        }
        renderRight={
          lastSyncTime ? (
            <span className="text-xs text-t-faint hidden md:flex items-center gap-1">
              <Clock size={10} />
              Synced {lastSyncTime.toLocaleTimeString()}
            </span>
          ) : undefined
        }
      />

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <IDELayout
        layoutRef={layoutRef}
        showLeftPanel={showDescription}
        leftPanelWidth={descriptionWidth}
        onLeftHandlePointerDown={startResize('description')}
        leftPanel={
          <div ref={leftPanelRef} className="flex flex-col h-full overflow-hidden bg-ide-panel">
            {/* ── Top: Description + Prelude ── */}
            <div className="overflow-auto" style={{ height: `${descSplitRatio * 100}%` }}>
              {/* Description Section */}
              <div className="border-b border-ide-border">
                <button
                  onClick={() => setShowDescription(!showDescription)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-t-muted uppercase tracking-wider hover:bg-ide-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={12} />
                    Description
                  </div>
                  {showDescription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <div
                  className="px-3 pb-3 text-sm text-t-secondary leading-relaxed overflow-auto learn-ocaml-description"
                  dangerouslySetInnerHTML={{
                    __html: exercise.description || '<p class="text-t-faint">No description available.</p>',
                  }}
                />
              </div>

              {/* Prelude Section */}
              {exercise.prelude && (
                <div className="border-b border-ide-border">
                  <button
                    onClick={() => setShowPrelude(!showPrelude)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-t-muted uppercase tracking-wider hover:bg-ide-hover transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Code size={12} />
                      Prelude (read-only)
                    </div>
                    {showPrelude ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showPrelude && (
                    <pre className="px-3 pb-3 text-xs text-t-muted font-mono overflow-auto leading-relaxed whitespace-pre-wrap">
                      {exercise.prelude}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* ── Vertical resize handle ── */}
            <div
              className="shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none cursor-row-resize"
              style={{ height: '6px' }}
              onPointerDown={startDescSplitResize}
            />

            {/* ── Bottom: Grade Report ── */}
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="px-3 py-2 text-xs font-semibold text-t-muted uppercase tracking-wider flex items-center gap-2">
                <Trophy size={12} />
                Grade Report
              </div>

              {learnOcaml.isGrading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="animate-spin text-orange-400" />
                    <p className="text-xs text-t-faint">Grading...</p>
                  </div>
                </div>
              ) : gradeResult ? (
                <div className="px-3 pb-3 space-y-3">
                  {/* Message when grading unavailable */}
                  {gradeResult.grade === null && gradeResult.report.length === 0 && (
                    <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20 flex items-start gap-2">
                      <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-amber-400 mb-1">Server-side grading not available</p>
                        <p className="text-xs text-t-muted">
                          {(gradeResult as any).message || 'Your code has been synced to the Learn OCaml server. Use the official Learn OCaml web client to grade your submission.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Score */}
                  {gradeResult.grade !== null && (
                  <div
                    className={`p-3 rounded-lg border ${
                      gradeResult.grade >= 100
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : gradeResult.grade > 0
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-rose-500/10 border-rose-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-t-secondary">Score</span>
                      <span
                        className={`text-lg font-bold ${
                          gradeResult.grade >= 100
                            ? 'text-emerald-400'
                            : gradeResult.grade > 0
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {gradeResult.grade}/{gradeResult.max_grade}
                      </span>
                    </div>
                    {gradeResult.grade >= 100 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400">
                        <CheckCircle2 size={12} />
                        Perfect score!
                      </div>
                    )}
                  </div>
                  )}

                  {/* Report items */}
                  {gradeResult.report.length > 0 && (
                    <div className="space-y-1.5">
                      {gradeResult.report.map((item, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded text-xs ${
                            item.status === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : item.status === 'failure'
                              ? 'bg-rose-500/10 text-rose-400'
                              : item.status === 'warning'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-surface-1 text-t-muted'
                          }`}
                        >
                          <div className="flex items-start gap-1.5">
                            {item.status === 'success' ? (
                              <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                            ) : item.status === 'failure' ? (
                              <AlertCircle size={12} className="shrink-0 mt-0.5" />
                            ) : null}
                            <div>
                              <span className="font-medium">{item.section}</span>
                              {item.message && <p className="mt-0.5 opacity-80">{item.message}</p>}
                            </div>
                            {item.points !== undefined && (
                              <span className="ml-auto font-mono shrink-0">{item.points}pt</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3 pb-3 text-center py-8">
                  <Trophy size={24} className="mx-auto text-t-ghost mb-2" />
                  <p className="text-xs text-t-faint">
                    Click "Grade" to submit your solution
                  </p>
                  <p className="text-xs text-t-ghost mt-1">
                    Ctrl+Shift+G
                  </p>
                </div>
              )}
            </div>
          </div>
        }
        editor={
          <LearnOcamlEditor
            code={code}
            onChange={setCode}
            fontSize={editorFontSize}
            onRun={handleRun}
          />
        }
        console={<Console />}
        showConsole={showConsole}
        consoleHeight={consoleHeight}
        onConsoleHeightChange={setConsoleHeight}
        rightPanel={<MemoryViewer />}
        showRightPanel={showMemoryPanel}
        rightPanelWidth={memoryPanelWidth}
        onRightHandlePointerDown={startResize('memory')}
      />
    </div>
  );
}

// ── Standalone Monaco Editor for Learn OCaml ─────────────────────────────────

function LearnOcamlEditor({
  code,
  onChange,
  fontSize,
  onRun,
}: {
  code: string;
  onChange: (code: string) => void;
  fontSize: number;
  onRun: () => void;
}) {
  const { theme } = useStore();
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const handleEditorBeforeMount = (monaco: any) => {
    registerOcamlLanguage(monaco);
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    // Add keyboard shortcut for Run
    editor.addAction({
      id: 'run-code',
      label: 'Run Code',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRunRef.current(),
    });
  };

  return (
    <MonacoEditor
      height="100%"
      language="ocaml"
      theme={theme === 'dark' ? 'caraml-dark' : 'caraml-light'}
      value={code}
      onChange={(value: string | undefined) => onChange(value || '')}
      beforeMount={handleEditorBeforeMount}
      onMount={handleEditorMount}
      options={{
        fontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        automaticLayout: true,
        padding: { top: 8 },
        bracketPairColorization: { enabled: true },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        snippetSuggestions: 'top',
        wordWrap: 'on',
      }}
    />
  );
}
