import { useCallback } from "react";

import { Button } from "./Button.js";
import { IconClose } from "./icons.js";
import { useDismissable } from "./use-dismissable.js";

import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered under the title in the header. */
  description?: string;
  /** Rendered in the header, left of the close button (e.g. an icon chip). */
  leading?: ReactNode;
  /** Pinned to the bottom of the dialog. */
  footer?: ReactNode;
  /** Constrains the body's max height. Defaults to a viewport-relative cap. */
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/**
 * Centred modal surface. Dismissal (Escape, backdrop click, focus trap, focus
 * restore) is owned by `useDismissable` so it matches `Sheet` exactly.
 */
export const Dialog = ({ open, onClose, title, description, leading, footer, size = "md", children }: DialogProps) => {
  const containerRef = useDismissable(open, onClose);

  const onBackdrop = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={onBackdrop}>
      <div
        ref={containerRef}
        className={`dialog dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="dialog__header">
          {leading}
          <div className="dialog__heading">
            <h2 className="dialog__title">{title}</h2>
            {description && <p className="dialog__description">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<IconClose size={13} />}
            aria-label={`Close ${title}`}
            onClick={onClose}
          />
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  );
};
