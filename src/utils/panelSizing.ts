import type { MemoryState } from '../types';

export type PanelWidthMode = 'auto' | 'manual';
export type PanelKind = 'fileTree' | 'memory';

export const DEFAULT_FILE_TREE_WIDTH = 208;
export const DEFAULT_MEMORY_PANEL_WIDTH = 288;
export const EDITOR_MIN_WIDTH = 420;
export const RESIZE_HANDLE_WIDTH = 6;

export const PANEL_LIMITS: Record<PanelKind, { min: number; max: number }> = {
  fileTree: { min: 180, max: 420 },
  memory: { min: 300, max: 760 },
};

const measurementCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measurementContext = measurementCanvas?.getContext('2d') ?? null;
const TEXT_MEASURE_FONT = '12px "JetBrains Mono", "Fira Code", monospace';

function measureTextWidth(text: string): number {
  if (!text) return 0;
  if (!measurementContext) return text.length * 7;
  measurementContext.font = TEXT_MEASURE_FONT;
  return measurementContext.measureText(text).width;
}

export function clampPanelWidth(kind: PanelKind, width: number): number {
  const bounds = PANEL_LIMITS[kind];
  if (!Number.isFinite(width)) return kind === 'fileTree' ? DEFAULT_FILE_TREE_WIDTH : DEFAULT_MEMORY_PANEL_WIDTH;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

function maxLineWidth(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, measureTextWidth(line));
  }
  return max;
}

export function computeAutoFileTreeWidth(fileNames: string[]): number {
  if (!fileNames.length) return DEFAULT_FILE_TREE_WIDTH;
  const contentWidth = maxLineWidth(fileNames);
  // Icon + paddings + action buttons.
  const target = Math.ceil(contentWidth + 92);
  return clampPanelWidth('fileTree', target);
}

function collectMemoryLines(memoryState: MemoryState): string[] {
  const lines: string[] = [];

  for (const binding of memoryState.environment) {
    lines.push(`${binding.name}: ${binding.type} = ${binding.value}`);
  }

  for (const frame of memoryState.stack) {
    lines.push(`${frame.name}${frame.line ? `:L${frame.line}` : ''}`);
    for (const variable of frame.variables) {
      lines.push(`${variable.name}: ${variable.type} = ${variable.value}`);
    }
  }

  for (const obj of memoryState.heap) {
    lines.push(`0x${obj.id.toString(16).padStart(3, '0')} ${obj.type} ${obj.value}`);
  }

  for (const typeDef of memoryState.typeDefinitions) {
    lines.push(`type ${typeDef.name}${typeDef.definition ? ` = ${typeDef.definition}` : ''}`);
  }

  return lines;
}

export function computeAutoMemoryPanelWidth(memoryState: MemoryState | null): number {
  if (!memoryState) return DEFAULT_MEMORY_PANEL_WIDTH;
  const lines = collectMemoryLines(memoryState);
  if (!lines.length) return PANEL_LIMITS.memory.min;
  const contentWidth = maxLineWidth(lines);
  // Section headers + padding + scrollbar.
  const target = Math.ceil(contentWidth + 110);
  return clampPanelWidth('memory', target);
}
