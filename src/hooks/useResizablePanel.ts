import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { PANEL_LIMITS, RESIZE_HANDLE_WIDTH, EDITOR_MIN_WIDTH, type PanelKind } from '../utils/panelSizing';

export type PanelSide = 'left' | 'right';

interface PanelConfig {
  kind: PanelKind;
  side: PanelSide;
  width: number;
  setWidth: (width: number, mode?: 'manual' | 'auto') => void;
  visible: boolean;
}

interface UseResizablePanelOptions {
  layoutRef: React.RefObject<HTMLDivElement | null>;
  panels: PanelConfig[];
  onResizeEnd?: () => void;
}

/**
 * Shared hook for drag-to-resize panel logic.
 * Supports one or more side panels (fileTree on left, memory on right).
 */
export function useResizablePanel({ layoutRef, panels, onResizeEnd }: UseResizablePanelOptions) {
  const dragStateRef = useRef<{ panelKind: string; startX: number; startWidth: number } | null>(null);

  const getLayoutWidth = useCallback(() => {
    return layoutRef.current?.clientWidth ?? window.innerWidth;
  }, [layoutRef]);

  const getMaxWidthForPanel = useCallback((targetKind: string, totalWidth?: number) => {
    const width = totalWidth ?? getLayoutWidth();
    const visibleHandles = panels.filter(p => p.visible).length;
    const handleSpace = visibleHandles * RESIZE_HANDLE_WIDTH;

    const target = panels.find(p => p.kind === targetKind);
    if (!target) return 0;

    // Sum widths of all OTHER visible panels
    const otherPanelWidth = panels
      .filter(p => p.kind !== targetKind && p.visible)
      .reduce((sum, p) => sum + p.width, 0);

    const available = width - otherPanelWidth - EDITOR_MIN_WIDTH - handleSpace;
    return Math.max(0, Math.min(PANEL_LIMITS[target.kind].max, available));
  }, [panels, getLayoutWidth]);

  const startResize = useCallback((panelKind: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const panel = panels.find(p => p.kind === panelKind);
    if (!panel) return;

    dragStateRef.current = { panelKind, startX: e.clientX, startWidth: panel.width };
    panel.setWidth(panel.width, 'manual');

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const p = panels.find(pp => pp.kind === dragState.panelKind);
      if (!p) return;

      const maxWidth = getMaxWidthForPanel(dragState.panelKind);
      const minWidth = Math.min(PANEL_LIMITS[p.kind].min, maxWidth);

      // Left panels grow when dragged right, right panels grow when dragged left
      const delta = event.clientX - dragState.startX;
      const nextWidth = p.side === 'left'
        ? dragState.startWidth + delta
        : dragState.startWidth - delta;

      p.setWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onResizeEnd?.();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [panels, getMaxWidthForPanel, onResizeEnd]);

  return { getLayoutWidth, getMaxWidthForPanel, startResize };
}
