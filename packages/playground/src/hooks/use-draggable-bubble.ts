import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface BubblePosition {
  /** Distance from viewport left (px). */
  x: number;
  /** Distance from viewport top (px). */
  y: number;
}

const BUBBLE_SIZE = 48;
const MARGIN = 8;
const DRAG_THRESHOLD_PX = 5;

function clampPosition(pos: BubblePosition, size = BUBBLE_SIZE): BubblePosition {
  const maxX = Math.max(MARGIN, window.innerWidth - size - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - size - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(MARGIN, pos.y)),
  };
}

function defaultPosition(size = BUBBLE_SIZE): BubblePosition {
  return clampPosition({
    x: MARGIN + 8,
    y: window.innerHeight - size - MARGIN - 8,
  });
}

function loadPosition(storageKey: string): BubblePosition {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultPosition();
    const parsed = JSON.parse(raw) as Partial<BubblePosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultPosition();
    }
    return clampPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return defaultPosition();
  }
}

function persistPosition(storageKey: string, pos: BubblePosition): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pos));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Fixed-position bubble that can be dragged; click (without drag) fires `onActivate`.
 */
export function useDraggableBubble(storageKey: string, onActivate: () => void) {
  const [position, setPosition] = useState<BubblePosition>(() =>
    typeof window !== "undefined" ? loadPosition(storageKey) : { x: 16, y: 16 }
  );
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const originRef = useRef({ pointerX: 0, pointerY: 0, startX: 0, startY: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        const next = clampPosition(prev);
        persistPosition(storageKey, next);
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storageKey]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    draggingRef.current = true;
    movedRef.current = false;
    originRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: positionRef.current.x,
      startY: positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - originRef.current.pointerX;
    const dy = event.clientY - originRef.current.pointerY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      movedRef.current = true;
    }
    if (!movedRef.current) return;
    const next = clampPosition({
      x: originRef.current.startX + dx,
      y: originRef.current.startY + dy,
    });
    setPosition(next);
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      if (movedRef.current) {
        persistPosition(storageKey, positionRef.current);
      } else {
        onActivate();
      }
    },
    [onActivate, storageKey]
  );

  return {
    position,
    bubbleSize: BUBBLE_SIZE,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
