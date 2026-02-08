import { useStore } from '../store';
import {
  BrainCircuit, Layers, Database, Code2, ChevronDown, ChevronRight, Tag
} from 'lucide-react';
import { useState } from 'react';

export function MemoryViewer() {
  const { memoryState } = useStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['stack', 'heap', 'types'])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  if (!memoryState) {
    return (
      <div className="flex flex-col h-full bg-ide-panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <BrainCircuit size={12} />
            <span>Memory</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-t-ghost">
            <BrainCircuit size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Run code to see memory state</p>
          </div>
        </div>
      </div>
    );
  }

  const { stack, heap, environment, typeDefinitions } = memoryState;

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <BrainCircuit size={12} />
          <span>Memory</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 text-xs font-mono">
        {/* Stack / Environment */}
        <SectionHeader
          icon={<Layers size={12} />}
          title="Environment"
          count={environment.length}
          expanded={expandedSections.has('stack')}
          onClick={() => toggleSection('stack')}
        />
        {expandedSections.has('stack') && (
          <div className="mb-3 ml-1">
            {environment.length === 0 ? (
              <div className="text-t-ghost italic pl-4 py-1">No bindings</div>
            ) : (
              <div className="space-y-0.5">
                {environment.map((v, i) => (
                  <div key={i} className="flex items-start gap-1 pl-4 py-0.5 hover:bg-ide-hover rounded group">
                    <span className="text-violet-400 shrink-0">{v.name}</span>
                    <span className="text-t-ghost">:</span>
                    <span className="text-brand-400 shrink-0">{v.type}</span>
                    <span className="text-t-ghost">=</span>
                    <span className="text-emerald-400 whitespace-pre-wrap break-words">{v.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Call Stack Frames */}
            {stack.filter(f => f.name !== 'Global').length > 0 && (
              <div className="mt-2 border-t border-ide-border pt-2">
                <div className="text-t-faint text-[10px] uppercase tracking-wider pl-4 mb-1">Call Stack</div>
                {stack.filter(f => f.name !== 'Global').map((frame, i) => (
                  <div key={i} className="mb-1.5">
                    <div className="flex items-center gap-1 pl-4 text-amber-400">
                      <Code2 size={10} />
                      <span>{frame.name}</span>
                      {frame.line && <span className="text-t-ghost text-[10px]">:L{frame.line}</span>}
                    </div>
                    {frame.variables.map((v, j) => (
                      <div key={j} className="flex items-start gap-1 pl-8 py-0.5 text-[11px]">
                        <span className="text-violet-300 shrink-0">{v.name}</span>
                        <span className="text-t-ghost">=</span>
                        <span className="text-t-muted whitespace-pre-wrap break-words">{v.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Heap Objects */}
        {heap.length > 0 && (
          <>
            <SectionHeader
              icon={<Database size={12} />}
              title="Heap"
              count={heap.length}
              expanded={expandedSections.has('heap')}
              onClick={() => toggleSection('heap')}
            />
            {expandedSections.has('heap') && (
              <div className="mb-3 ml-1">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-t-ghost text-[10px] uppercase">
                        <th className="text-left pl-4 py-1 font-medium">Addr</th>
                        <th className="text-left py-1 font-medium">Type</th>
                        <th className="text-left py-1 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heap.map((obj, i) => (
                        <tr key={i} className="hover:bg-ide-hover">
                          <td className="pl-4 py-0.5 text-amber-500/70 align-top">0x{obj.id.toString(16).padStart(3, '0')}</td>
                          <td className="py-0.5 text-brand-400 align-top whitespace-pre-wrap break-words">{obj.type}</td>
                          <td className="py-0.5 text-emerald-400 align-top whitespace-pre-wrap break-words">{obj.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Type Definitions */}
        {typeDefinitions.length > 0 && (
          <>
            <SectionHeader
              icon={<Tag size={12} />}
              title="Types"
              count={typeDefinitions.length}
              expanded={expandedSections.has('types')}
              onClick={() => toggleSection('types')}
            />
            {expandedSections.has('types') && (
              <div className="mb-3 ml-1">
                {typeDefinitions.map((td, i) => (
                  <div key={i} className="pl-4 py-0.5 hover:bg-ide-hover rounded">
                    <span className="text-brand-400">type </span>
                    <span className="text-violet-400">{td.name}</span>
                    {td.definition && (
                      <>
                        <span className="text-t-ghost"> = </span>
                        <span className="text-t-muted whitespace-pre-wrap break-words">{td.definition}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon, title, count, expanded, onClick
}: {
  icon: React.ReactNode; title: string; count: number; expanded: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-t-muted uppercase tracking-wider hover:bg-ide-hover rounded transition-colors"
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {icon}
      <span>{title}</span>
      <span className="ml-auto text-t-ghost text-[10px] font-normal">{count}</span>
    </button>
  );
}

