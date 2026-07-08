import type { MemoryState } from '../types';

export type PanelWidthMode = 'auto' | 'manual';
export type PanelKind = 'fileTree' | 'memory' | 'description';

export const DEFAULT_FILE_TREE_WIDTH = 208;
export const DEFAULT_MEMORY_PANEL_WIDTH = 288;
export const DEFAULT_DESCRIPTION_WIDTH = 320;
export const EDITOR_MIN_WIDTH = 420;
export const RESIZE_HANDLE_WIDTH = 6;

export const DEFAULT_CONSOLE_HEIGHT = 256;
export const CONSOLE_MIN_HEIGHT = 80;
export const CONSOLE_MAX_HEIGHT = 600;
export const CONSOLE_HANDLE_HEIGHT = 6;

export const PANEL_LIMITS: Record<PanelKind, { min: number; max: number }> = {
  fileTree: { min: 180, max: 420 },
  memory: { min: 300, max: 760 },
  description: { min: 200, max: 520 },
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

const PANEL_DEFAULTS: Record<PanelKind, number> = {
  fileTree: DEFAULT_FILE_TREE_WIDTH,
  memory: DEFAULT_MEMORY_PANEL_WIDTH,
  description: DEFAULT_DESCRIPTION_WIDTH,
};

export function clampPanelWidth(kind: PanelKind, width: number): number {
  const bounds = PANEL_LIMITS[kind];
  if (!Number.isFinite(width)) return PANEL_DEFAULTS[kind];
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

export function clampConsoleHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_CONSOLE_HEIGHT;
  return Math.round(Math.min(CONSOLE_MAX_HEIGHT, Math.max(CONSOLE_MIN_HEIGHT, height)));
}

function maxLineWidth(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, measureTextWidth(line));
  }
  return max;
}

export interface PanelFitInput {
  kind: PanelKind;
  width: number;
  visible: boolean;
}

/**
 * Compute panel widths that fit the viewport in ONE deterministic pass.
 *
 * Clamping each panel independently oscillates forever on narrow viewports:
 * shrinking one panel frees space that pushes the other back up to its
 * minimum, which re-shrinks the first one, and so on (React error #185).
 * This function instead resolves all panels together and is a fixed point —
 * feeding its output back returns the same values, so effects converge.
 * Right-most panels shrink first; widths only drop below their minimum when
 * even the minimums don't fit, in which case they scale proportionally.
 */
export function fitPanelsToViewport(
  layoutWidth: number,
  panels: PanelFitInput[]
): Record<string, number> {
  const visible = panels.filter((p) => p.visible);
  const handleSpace = visible.length * RESIZE_HANDLE_WIDTH;
  const available = Math.max(0, layoutWidth - EDITOR_MIN_WIDTH - handleSpace);

  const widths = new Map<string, number>();
  for (const p of visible) {
    widths.set(p.kind, clampPanelWidth(p.kind, p.width));
  }

  const total = () => [...widths.values()].reduce((a, b) => a + b, 0);

  // Shrink panels toward their minimum, starting from the right-most one.
  for (let i = visible.length - 1; i >= 0 && total() > available; i--) {
    const p = visible[i];
    const current = widths.get(p.kind)!;
    const shrinkable = current - PANEL_LIMITS[p.kind].min;
    const overflow = total() - available;
    if (shrinkable > 0) {
      widths.set(p.kind, current - Math.min(shrinkable, overflow));
    }
  }

  // Even the minimum widths overflow: scale everything proportionally.
  const finalTotal = total();
  if (finalTotal > available && finalTotal > 0) {
    for (const [kind, width] of widths) {
      widths.set(kind, Math.floor((width * available) / finalTotal));
    }
  }

  const result: Record<string, number> = {};
  for (const p of panels) {
    result[p.kind] = p.visible ? widths.get(p.kind)! : p.width;
  }
  return result;
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
