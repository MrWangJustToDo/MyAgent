import type { ReactNode } from "react";

export interface StateProps {
  /** Glyph shown in the framed chip above the title. */
  icon?: ReactNode;
  title: string;
  /** Supports inline `<code>` for commands and paths. */
  hint?: ReactNode;
  /** Replaces `icon` with a spinner. */
  loading?: boolean;
  /** Rendered under the hint (buttons, links). */
  action?: ReactNode;
}

/** Shared empty / loading / error presentation so every panel reads the same. */
export const State = ({ icon, title, hint, loading, action }: StateProps) => (
  <div className="state">
    <div className="state__icon" aria-hidden="true">
      {loading ? <span className="spinner" /> : icon}
    </div>
    <div className="state__title">{title}</div>
    {hint != null && <div className="state__hint">{hint}</div>}
    {action}
  </div>
);

export interface ToastProps {
  message: string;
  tone?: "default" | "success" | "error";
}

/** Transient status message anchored above the status bar. */
export const Toast = ({ message, tone = "default" }: ToastProps) => (
  <div className={`toast${tone === "default" ? "" : ` toast--${tone}`}`} role="status" aria-live="polite">
    {message}
  </div>
);
