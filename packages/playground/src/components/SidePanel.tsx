import { useCallback, useEffect, useRef, useState } from "react";

import { usePointerDrag } from "../hooks/use-pointer-drag.js";

import type { ReactNode } from "react";

const WIDTH_STORAGE_KEY = "codent-playground-split";

export interface SidePanelProps {
  children: ReactNode;
  defaultWidth?: number;
  minMainWidth?: number;
  minWidth?: number;
  /** Step applied by arrow keys. */
  keyboardStep?: number;
  /** Accessible name for the resizer. */
  resizerLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function loadWidth(fallback: number, min: number): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= min) return n;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function persistWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // ignore
  }
}

/**
 * Resizable side panel (handle + panel body).
 *
 * Deliberately renders only the handle and the panel: the terminal is a sibling
 * of this component in the shell, not a child, so toggling the panel never moves
 * the terminal in the tree and the running agent is never remounted.
 *
 * Sizing uses Pointer Events with capture so a drag cannot "stick" when the
 * pointer leaves the window or crosses the preview iframe; `role="separator"` +
 * `aria-valuenow` make it keyboard-operable; double-click restores the default.
 * The drag lifecycle itself (including every way a release can be lost) lives in
 * `usePointerDrag`, shared with the file tree's resizer.
 */
export const SidePanel = ({
  children,
  defaultWidth = 460,
  minMainWidth = 380,
  minWidth = 320,
  keyboardStep = 24,
  resizerLabel = "Resize workspace panel",
}: SidePanelProps) => {
  const [width, setWidth] = useState(() => loadWidth(defaultWidth, minWidth));

  const hostRef = useRef<HTMLDivElement>(null);
  const liveWidthRef = useRef(width);

  liveWidthRef.current = width;

  const bounds = useCallback(() => {
    const total = hostRef.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    return { min: minWidth, max: Math.max(minWidth, total - minMainWidth) };
  }, [minMainWidth, minWidth]);

  const commit = useCallback(
    (next: number) => {
      const { min, max } = bounds();
      setWidth(clamp(next, min, max));
    },
    [bounds]
  );

  const { handlers } = usePointerDrag({
    onMove: useCallback(
      (clientX: number) => {
        const parentRect = hostRef.current?.parentElement?.getBoundingClientRect();
        if (!parentRect) return;
        commit(parentRect.right - clientX);
      },
      [commit]
    ),
    onEnd: useCallback(() => persistWidth(liveWidthRef.current), []),
  });

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? keyboardStep * 4 : keyboardStep;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commit(liveWidthRef.current + step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commit(liveWidthRef.current - step);
      } else if (event.key === "Home") {
        event.preventDefault();
        commit(defaultWidth);
      }
    },
    [commit, defaultWidth, keyboardStep]
  );

  // Keep the terminal above its minimum width when the viewport shrinks.
  useEffect(() => {
    const onResize = () => {
      const { min, max } = bounds();
      setWidth((current) => clamp(current, min, max));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bounds]);

  return (
    <div ref={hostRef} className="side-panel">
      <div
        className="side-panel__handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={resizerLabel}
        aria-valuenow={Math.round(width)}
        aria-valuemin={minWidth}
        tabIndex={0}
        {...handlers}
        onDoubleClick={() => commit(defaultWidth)}
        onKeyDown={onKeyDown}
      />
      <div className="side-panel__body" style={{ width }}>
        {children}
      </div>
    </div>
  );
};
