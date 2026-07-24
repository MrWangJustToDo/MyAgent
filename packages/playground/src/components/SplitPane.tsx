import { useCallback, useEffect, useRef, useState } from "react";

import type { ReactNode } from "react";

const SPLIT_STORAGE_KEY = "my-agent-playground-split";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  visible: boolean;
  defaultRightWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
}

function loadWidth(key: string, fallback: number, min: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= min) return n;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function persistWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // ignore
  }
}

export const SplitPane = ({
  left,
  right,
  visible,
  defaultRightWidth = 420,
  minLeftWidth = 300,
  minRightWidth = 280,
}: SplitPaneProps) => {
  const [rightWidth, setRightWidth] = useState(() => loadWidth(SPLIT_STORAGE_KEY, defaultRightWidth, minRightWidth));

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const liveWidthRef = useRef(rightWidth);

  liveWidthRef.current = rightWidth;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    if (!visible) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      const clamped = Math.max(minRightWidth, Math.min(newWidth, rect.width - minLeftWidth));
      setRightWidth(clamped);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistWidth(SPLIT_STORAGE_KEY, liveWidthRef.current);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [visible, minLeftWidth, minRightWidth]);

  return (
    <div ref={containerRef} className="split-pane">
      <div className="split-pane__left">{left}</div>
      {visible && <div className="split-pane__splitter" onMouseDown={onMouseDown} />}
      {visible && (
        <div className="split-pane__right split-pane__right-enter" style={{ width: rightWidth }}>
          {right}
        </div>
      )}
    </div>
  );
};
