import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { useStore } from '../store';
import { Console } from '../components/Console';
import { api } from '../services/api';
import { interpret } from '../interpreter';
import { registerOcamlLanguage } from '../components/Editor';
import {
  ArrowLeft, Loader2, Play, CheckCircle2, AlertCircle,
  GraduationCap, FileText, Code, Upload, Trophy,
  ChevronDown, ChevronUp, Clock, UploadCloud,
  PanelBottomClose, PanelBottomOpen,
} from 'lucide-react';

export function LearnOcamlExercisePage() {
  const params = useParams();
  // Exercise IDs contain slashes (e.g. "tp1/lists"), so we use wildcard route
  const decodedId = params['*'] || '';
  const navigate = useNavigate();
  const {
    learnOcaml, learnOcamlLoadExercise, learnOcamlSyncAnswer, learnOcamlGrade,
    setExecutionResult, setIsRunning, isRunning, executionResult,
    capabilities, loadCapabilities, addNotification,
    editorFontSize, consoleFontSize,
  } = useStore();

  const [code, setCode] = useState('');
  const [showDescription, setShowDescription] = useState(true);
  const [showPrelude, setShowPrelude] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [showGradePanel, setShowGradePanel] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSetInitialCode = useRef(false);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSync(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        handleGrade();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, decodedId, isRunning]);

  // ── Run Code ───────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (!code || isRunning) return;
    setIsRunning(true);

    // Prepend prelude if available
    const fullCode = exercise?.prelude
      ? `${exercise.prelude}\n\n(* === Your code === *)\n${code}`
      : code;

    try {
      if (capabilities.ocaml) {
        const toplevelResult = await api.runToplevel(fullCode);
        if (toplevelResult.backend) {
          let memoryState: import('../types').MemoryState = { stack: [], heap: [], environment: [], typeDefinitions: [] };
          try {
            const localResult = interpret(code);
            memoryState = localResult.memoryState;
          } catch {}

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

      // Fallback: browser interpreter
      setTimeout(() => {
        try {
          const result = interpret(code);
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
    } catch {
      try {
        const result = interpret(code);
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
  }, [code, isRunning, capabilities, exercise]);

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

  // ── Loading State ──────────────────────────────────────────────────────

  if (learnOcaml.isLoadingExercise || !exercise) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-400" size={32} />
          <p className="text-slate-400">Loading exercise...</p>
        </div>
      </div>
    );
  }

  const currentGrade = learnOcaml.grades[decodedId] ?? exercise.grade ?? null;

  return (
    <div className="h-screen flex flex-col bg-ide-bg overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center justify-between px-3 bg-ide-sidebar border-b border-ide-border shrink-0 z-40">
        {/* Left */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/learn-ocaml')} className="btn-icon" title="Back to exercises">
            <ArrowLeft size={18} />
          </button>
          <GraduationCap size={18} className="text-orange-400" />
          <span className="text-sm font-medium text-slate-300 truncate max-w-[300px]">
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
        </div>

        {/* Center Controls */}
        <div className="flex items-center gap-1">
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
            onClick={() => setShowConsole(!showConsole)}
            className={`btn-icon ${showConsole ? 'text-brand-400' : ''}`}
            title="Toggle Console"
          >
            {showConsole ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {lastSyncTime && (
            <span className="text-xs text-slate-500 hidden md:flex items-center gap-1">
              <Clock size={10} />
              Synced {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Description + Prelude + Grade */}
        <div className="w-80 shrink-0 border-r border-ide-border flex flex-col overflow-hidden bg-ide-panel">
          {/* Description Section */}
          <div className="border-b border-ide-border">
            <button
              onClick={() => setShowDescription(!showDescription)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText size={12} />
                Description
              </div>
              {showDescription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showDescription && (
              <div
                className="px-3 pb-3 text-sm text-slate-300 leading-relaxed overflow-auto max-h-64 learn-ocaml-description"
                dangerouslySetInnerHTML={{
                  __html: exercise.description || '<p class="text-slate-500">No description available.</p>',
                }}
              />
            )}
          </div>

          {/* Prelude Section */}
          {exercise.prelude && (
            <div className="border-b border-ide-border">
              <button
                onClick={() => setShowPrelude(!showPrelude)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Code size={12} />
                  Prelude (read-only)
                </div>
                {showPrelude ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showPrelude && (
                <pre className="px-3 pb-3 text-xs text-slate-400 font-mono overflow-auto max-h-48 leading-relaxed whitespace-pre-wrap">
                  {exercise.prelude}
                </pre>
              )}
            </div>
          )}

          {/* Grade Result Panel */}
          <div className="flex-1 overflow-auto">
            <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Trophy size={12} />
              Grade Report
            </div>

            {learnOcaml.isGrading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={24} className="animate-spin text-orange-400" />
                  <p className="text-xs text-slate-500">Grading...</p>
                </div>
              </div>
            ) : gradeResult ? (
              <div className="px-3 pb-3 space-y-3">
                {/* Score */}
                <div
                  className={`p-3 rounded-lg border ${
                    gradeResult.grade !== null && gradeResult.grade >= 100
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : gradeResult.grade !== null && gradeResult.grade > 0
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : 'bg-rose-500/10 border-rose-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Score</span>
                    <span
                      className={`text-lg font-bold ${
                        gradeResult.grade !== null && gradeResult.grade >= 100
                          ? 'text-emerald-400'
                          : gradeResult.grade !== null && gradeResult.grade > 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {gradeResult.grade ?? 0}/{gradeResult.max_grade}
                    </span>
                  </div>
                  {gradeResult.grade !== null && gradeResult.grade >= 100 && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400">
                      <CheckCircle2 size={12} />
                      Perfect score!
                    </div>
                  )}
                </div>

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
                            : 'bg-slate-800/50 text-slate-400'
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
                <Trophy size={24} className="mx-auto text-slate-700 mb-2" />
                <p className="text-xs text-slate-500">
                  Click "Grade" to submit your solution
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Ctrl+Shift+G
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Editor + Console */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Editor */}
          <div className={`${showConsole ? 'flex-1 min-h-0' : 'flex-1'} overflow-hidden`}>
            <LearnOcamlEditor
              code={code}
              onChange={setCode}
              fontSize={editorFontSize}
              onRun={handleRun}
            />
          </div>

          {/* Console */}
          {showConsole && (
            <div className="h-64 shrink-0 border-t border-ide-border overflow-hidden">
              <Console />
            </div>
          )}
        </div>
      </div>
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
  const handleEditorBeforeMount = (monaco: any) => {
    registerOcamlLanguage(monaco);
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    // Add keyboard shortcut for Run
    editor.addAction({
      id: 'run-code',
      label: 'Run Code',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRun(),
    });
  };

  return (
    <MonacoEditor
      height="100%"
      language="ocaml"
      theme="caraml-dark"
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
