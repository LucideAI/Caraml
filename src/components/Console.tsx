import { useRef, useEffect, useState } from 'react';
import { useStore } from '../store';
import { interpret } from '../interpreter';
import { Terminal, Trash2, Copy, Check, Clock, AlertCircle, CheckCircle2, Server, Cpu } from 'lucide-react';

export function Console() {
  const { executionResult, consoleFontSize, capabilities } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executionResult]);

  const handleCopy = () => {
    if (!executionResult) return;
    const text = formatOutput();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatOutput = (): string => {
    if (!executionResult) return '';
    let result = '';
    if (executionResult.output) result += executionResult.output;
    if (executionResult.values.length > 0) {
      result += executionResult.values.map(v => {
        if (v.name === '-') return `- : ${v.type} = ${v.value}`;
        if (v.type === 'type') return v.value;
        if (v.type === 'exception') return v.value;
        return `val ${v.name} : ${v.type} = ${v.value}`;
      }).join('\n') + '\n';
    }
    return result;
  };

  const hasErrors = executionResult?.errors && executionResult.errors.length > 0;

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* Console Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Terminal size={12} />
          <span>Console</span>
          {executionResult && (
            <span className={`badge ${hasErrors ? 'badge-error' : 'badge-success'}`}>
              {hasErrors ? (
                <><AlertCircle size={10} className="mr-1" /> Errors</>
              ) : (
                <><CheckCircle2 size={10} className="mr-1" /> OK</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {executionResult && (
            <>
              <span className="flex items-center gap-1 text-t-faint text-[10px] mr-1" title={capabilities.ocaml ? 'Executed with real OCaml' : 'Executed with browser interpreter'}>
                {capabilities.ocaml ? <Server size={10} /> : <Cpu size={10} />}
                {capabilities.ocaml ? 'OCaml' : 'Browser'}
              </span>
              <span className="flex items-center gap-1 text-t-faint text-[10px] mr-2">
                <Clock size={10} />
                {executionResult.executionTimeMs.toFixed(1)}ms
              </span>
            </>
          )}
          <button onClick={handleCopy} className="btn-icon p-1" title="Copy output">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => useStore.getState().setExecutionResult(null)}
            className="btn-icon p-1"
            title="Clear"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono" style={{ fontSize: consoleFontSize }}>
        {!executionResult ? (
          <div className="text-t-ghost italic text-sm">
            Press Ctrl+Enter or click Run to execute your code...
          </div>
        ) : (
          <div className="space-y-1">
            {/* Standard output */}
            {executionResult.output && (
              <pre className="text-t-secondary whitespace-pre-wrap">{executionResult.output}</pre>
            )}

            {/* Values */}
            {executionResult.values.map((v, i) => (
              <div key={i} className="flex flex-wrap gap-1">
                {v.type === 'type' ? (
                  <span className="text-brand-400">{v.value}</span>
                ) : v.type === 'exception' ? (
                  <span className="text-amber-400">{v.value}</span>
                ) : (
                  <>
                    <span className="text-t-faint">{v.name === '-' ? '-' : `val ${v.name}`}</span>
                    <span className="text-t-ghost">:</span>
                    <span className="text-brand-400">{v.type}</span>
                    <span className="text-t-ghost">=</span>
                    <span className="text-emerald-400">{v.value}</span>
                  </>
                )}
              </div>
            ))}

            {/* Errors */}
            {executionResult.errors?.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-rose-400">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div>
                  {err.line > 0 && (
                    <span className="text-rose-500 text-xs">Line {err.line}: </span>
                  )}
                  <span>{err.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
