import { Button } from "./Button.js";
import { IconClose } from "./icons.js";
import { useDismissable } from "./use-dismissable.js";

import type { ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered in the header, left of the close button. */
  leading?: ReactNode;
  /** Rendered in the header, right of the title (before the close button). */
  actions?: ReactNode;
  /** Anchored edge. Defaults to the bottom edge. */
  side?: "bottom" | "right";
  children: ReactNode;
}

/**
 * Edge-anchored overlay used when a side pane does not fit (compact viewports).
 * Shares `useDismissable` with `Dialog`, so Escape / backdrop / focus semantics
 * are identical between the two surfaces.
 */
export const Sheet = ({ open, onClose, title, leading, actions, side = "bottom", children }: SheetProps) => {
  const containerRef = useDismissable(open, onClose);

  if (!open) return null;

  return (
    <div
      className={side === "bottom" ? "overlay overlay--edge" : "overlay overlay--edge overlay--right"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className={`sheet sheet--${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="sheet__header">
          <span className="sheet__grabber" aria-hidden="true" />
          {leading}
          <h2 className="sheet__title">{title}</h2>
          <div className="sheet__actions">{actions}</div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<IconClose size={13} />}
            aria-label={`Close ${title}`}
            onClick={onClose}
          />
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
};
