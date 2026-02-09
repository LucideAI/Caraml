import { useRef, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CONSOLE_MIN_HEIGHT,
  CONSOLE_MAX_HEIGHT,
  CONSOLE_HANDLE_HEIGHT,
} from '../utils/panelSizing';

interface IDELayoutProps {
  layoutRef: React.RefObject<HTMLDivElement>;

  // Left panel (file tree, description, etc.)
  leftPanel?: ReactNode;
  showLeftPanel?: boolean;
  leftPanelWidth?: number;
  onLeftHandlePointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;

  // Right panel (memory viewer, etc.)
  rightPanel?: ReactNode;
  showRightPanel?: boolean;
  rightPanelWidth?: number;
  onRightHandlePointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;

  // Editor area
  tabs?: ReactNode;
  editor: ReactNode;

  // Console with vertical resize
  console?: ReactNode;
  showConsole?: boolean;
  consoleHeight: number;
  onConsoleHeightChange: (height: number) => void;
}

export function IDELayout({
  layoutRef,
  leftPanel,
  showLeftPanel = false,
  leftPanelWidth = 0,
  onLeftHandlePointerDown,
  rightPanel,
  showRightPanel = false,
  rightPanelWidth = 0,
  onRightHandlePointerDown,
  tabs,
  editor,
  console: consoleContent,
  showConsole = false,
  consoleHeight,
  onConsoleHeightChange,
}: IDELayoutProps) {
  const consoleDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const startConsoleResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    consoleDragRef.current = { startY: e.clientY, startHeight: consoleHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const drag = consoleDragRef.current;
      if (!drag) return;
      // Dragging up = larger console
      const delta = drag.startY - event.clientY;
      const next = Math.min(CONSOLE_MAX_HEIGHT, Math.max(CONSOLE_MIN_HEIGHT, drag.startHeight + delta));
      onConsoleHeightChange(next);
    };

    const handlePointerUp = () => {
      consoleDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, [consoleHeight, onConsoleHeightChange]);

  return (
    <div ref={layoutRef} className="flex-1 flex overflow-hidden">
      {/* ── Left Panel ───────────────────────────────────── */}
      {showLeftPanel && leftPanel && (
        <>
          <div
            style={{ width: `${leftPanelWidth}px` }}
            className="shrink-0 border-r border-ide-border overflow-hidden"
          >
            {leftPanel}
          </div>
          {onLeftHandlePointerDown && (
            <div
              className="resize-handle shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none"
              style={{ width: `${CONSOLE_HANDLE_HEIGHT}px` }}
              onPointerDown={onLeftHandlePointerDown}
            />
          )}
        </>
      )}

      {/* ── Center: Editor + Console ─────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tabs (optional) */}
        {tabs}

        {/* Editor + Console Split */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div className={`${showConsole ? 'flex-1 min-h-0' : 'flex-1'} overflow-hidden`}>
            {editor}
          </div>

          {/* Console vertical resize handle + console */}
          {showConsole && consoleContent && (
            <>
              <div
                className="resize-handle shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none cursor-row-resize"
                style={{ height: `${CONSOLE_HANDLE_HEIGHT}px` }}
                onPointerDown={startConsoleResize}
              />
              <div
                style={{ height: `${consoleHeight}px` }}
                className="shrink-0 overflow-hidden"
              >
                {consoleContent}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Right Panel ──────────────────────────────────── */}
      {showRightPanel && rightPanel && (
        <>
          {onRightHandlePointerDown && (
            <div
              className="resize-handle shrink-0 bg-ide-border/70 hover:bg-brand-500/40 transition-colors touch-none"
              style={{ width: `${CONSOLE_HANDLE_HEIGHT}px` }}
              onPointerDown={onRightHandlePointerDown}
            />
          )}
          <div
            style={{ width: `${rightPanelWidth}px` }}
            className="shrink-0 border-l border-ide-border overflow-hidden"
          >
            {rightPanel}
          </div>
        </>
      )}
    </div>
  );
}
