import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Module-level stack of open overlays.
 *
 * Overlays can nest (the settings dialog over the workspace sheet), and each one
 * registers its own document-level key handler. Without a stack, `Escape` would
 * close every open layer at once. Only the topmost entry reacts.
 */
const openOverlays: symbol[] = [];

function isTopmost(token: symbol): boolean {
  return openOverlays[openOverlays.length - 1] === token;
}

/**
 * Shared dismissal + focus contract for every overlay surface (`Dialog`, `Sheet`,
 * command palette). Owning it in one place is what stops `Escape` handling, focus
 * restoration and focus trapping from drifting between overlays.
 *
 * Returns a ref to attach to the overlay's outermost focusable container.
 */
export function useDismissable(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const tokenRef = useRef<symbol>(Symbol("overlay"));

  // Escape closes the topmost overlay; Tab is trapped inside it.
  useEffect(() => {
    if (!open) return;

    const token = tokenRef.current;
    if (!openOverlays.includes(token)) openOverlays.push(token);
    // Keep the newest overlay on top of the stack regardless of effect ordering.
    openOverlays.splice(openOverlays.indexOf(token), 1);
    openOverlays.push(token);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost(token)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = openOverlays.indexOf(token);
      if (index !== -1) openOverlays.splice(index, 1);
    };
  }, [open, onClose]);

  // Move focus in on open, restore it on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      // Defer so the node is painted before we focus it.
      requestAnimationFrame(() => (first ?? container).focus());
    }

    return () => {
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    };
  }, [open]);

  // Lock body scroll. Only the outermost overlay owns the original value, so
  // closing an inner layer does not unlock the page underneath the outer one.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return containerRef;
}
