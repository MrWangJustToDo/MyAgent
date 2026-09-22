import { useCallback, useEffect, useRef } from "react";

import type { PointerEvent as ReactPointerEvent } from "react";

export interface PointerDragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  /** Fires whenever a drag ends, including when the release is lost. */
  onClickCapture: () => void;
}

export interface PointerDragOptions {
  /** Receives the pointer position of every move that belongs to a drag. */
  onMove: (clientX: number, clientY: number, event: PointerEvent) => void;
  /** Runs once per drag, after the flag is cleared and the body class removed. */
  onEnd?: () => void;
}

export interface PointerDrag {
  /** Attach to the element that starts the drag (and receives moves while captured). */
  handlers: PointerDragHandlers;
}

/**
 * True for a mouse move that cannot belong to a drag.
 *
 * A drag always has the left button held, so `buttons === 0` means the release
 * was missed. Touch/pen pointers legitimately report `buttons === 0` while
 * touching, hence the mouse-only check.
 */
function isReleaseMissed(event: { pointerType?: string; buttons: number }): boolean {
  return event.pointerType === "mouse" && event.buttons === 0;
}

/**
 * One owner for "the user is dragging a divider" state.
 *
 * A drag is armed by `pointerdown` and ended by the first of several release
 * signals: this element's `pointerup` / `pointercancel` / `click`, a
 * window-level `pointerup` / `mouseup`, or the window losing focus. Pointer
 * capture normally delivers the release, but that is exactly the path that can
 * fail — released outside the window, another window/app taking the release, or
 * the element being remounted mid-drag. When it fails, the native `pointermove`
 * stream keeps flowing with `buttons === 0`; a flag only `pointerup` can clear
 * then leaves the divider following a merely hovering pointer — the drag
 * "sticks".
 *
 * Two independent guards, so no single missed event can reproduce it:
 * - lifecycle: every release path above clears the flag;
 * - a `buttons` check on each move, since a move with no button held is never a
 *   drag regardless of what the flag says.
 *
 * `window` listeners are attached once and are inert while no drag is underway
 * (every entry point returns early unless the flag is set).
 */
export function usePointerDrag({ onMove, onEnd }: PointerDragOptions): PointerDrag {
  const draggingRef = useRef(false);
  const moveRef = useRef(onMove);
  const endRef = useRef(onEnd);

  moveRef.current = onMove;
  endRef.current = onEnd;

  const finish = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.classList.remove("is-resizing");
    endRef.current?.();
  }, []);

  useEffect(() => {
    // Belt: these read no button at all — the release happened somewhere we cannot
    // see, so there is nothing left to drag.
    const onWindowRelease = () => finish();
    // Brace: the stream keeps flowing without a button, so end on the first move
    // that proves the release was missed rather than waiting for one to arrive.
    // (A captured pointer keeps delivering here, which is what makes this work.)
    const onWindowMove = (event: PointerEvent) => {
      if (isReleaseMissed(event)) finish();
    };

    window.addEventListener("blur", onWindowRelease);
    window.addEventListener("pointerup", onWindowRelease);
    window.addEventListener("mouseup", onWindowRelease);
    window.addEventListener("pointermove", onWindowMove);
    return () => {
      window.removeEventListener("blur", onWindowRelease);
      window.removeEventListener("pointerup", onWindowRelease);
      window.removeEventListener("mouseup", onWindowRelease);
      window.removeEventListener("pointermove", onWindowMove);
      finish();
    };
  }, [finish]);

  const handlers: PointerDragHandlers = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      draggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an optimisation, not a requirement: the other release paths
        // still clear the flag.
      }
      document.body.classList.add("is-resizing");
    },
    onPointerMove: (event) => {
      if (!draggingRef.current) return;
      if (isReleaseMissed(event)) {
        finish();
        return;
      }
      moveRef.current(event.clientX, event.clientY, event.nativeEvent);
    },
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(),
    // A click whose first movement passed the browser's drag threshold re-targets
    // to the nearest common ancestor, so the release lands anywhere up the tree.
    // Ending the drag on capture-phase click covers that path too.
    onClickCapture: () => finish(),
  };

  return { handlers };
}
