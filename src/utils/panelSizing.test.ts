import { describe, expect, it } from 'vitest';
import {
  clampConsoleHeight,
  clampPanelWidth,
  fitPanelsToViewport,
} from './panelSizing';

describe('panel sizing', () => {
  it('clamps invalid and out-of-range sizes', () => {
    expect(clampPanelWidth('fileTree', 20)).toBe(180);
    expect(clampPanelWidth('memory', 5000)).toBe(760);
    expect(clampConsoleHeight(Number.NaN)).toBe(256);
  });

  it('produces a stable layout on narrow viewports', () => {
    const panels = [
      { kind: 'fileTree' as const, width: 300, visible: true },
      { kind: 'memory' as const, width: 500, visible: true },
    ];
    const first = fitPanelsToViewport(760, panels);
    const second = fitPanelsToViewport(760, [
      { ...panels[0], width: first.fileTree },
      { ...panels[1], width: first.memory },
    ]);
    expect(second).toEqual(first);
    expect(first.fileTree + first.memory).toBeLessThanOrEqual(328);
  });
});
