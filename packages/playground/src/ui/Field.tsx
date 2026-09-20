import { cloneElement, forwardRef, useId } from "react";

import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const classNames = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

// ============================================================================
// Field — label + control + hint/error wrapper
// ============================================================================

export interface FieldProps {
  label: string;
  /** Rendered under the control; replaced by `error` when present. */
  hint?: ReactNode;
  error?: string;
  /** Dims the label and marks the region inert (the control itself decides `disabled`). */
  muted?: boolean;
  /** Render the control inline with the label (used by switches). */
  inline?: boolean;
  /** Explicit label association; otherwise the single primitive child is used. */
  htmlFor?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error wrapper.
 *
 * The label is associated with the control automatically when the child is one
 * of this module's primitives, so callers do not have to thread ids through. A
 * composite child (a group of buttons, an input plus an action) is left alone —
 * a `<label>` may only wrap/point at one labelable element.
 */
export const Field = ({ label, hint, error, muted, inline, htmlFor, children }: FieldProps) => {
  const autoId = useId();
  const associates =
    children != null &&
    typeof children === "object" &&
    "type" in children &&
    (children.type === Input || children.type === Select || children.type === Textarea || children.type === Switch);

  const labelFor = htmlFor ?? (associates ? autoId : undefined);
  const control = associates
    ? cloneElement(children as ReactElement<{ id?: string }>, { id: htmlFor ?? autoId })
    : children;

  return (
    <div className={classNames("field", inline && "field--inline", muted && "field--muted")}>
      <label className="field__label" htmlFor={labelFor}>
        {label}
      </label>
      <div className="field__control">{control}</div>
      {error ? (
        <p className="field__message field__message--error" role="alert">
          {error}
        </p>
      ) : (
        hint != null && <p className="field__message">{hint}</p>
      )}
    </div>
  );
};

// ============================================================================
// Input
// ============================================================================

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the invalid border/ring without needing a wrapper Field error. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={classNames("input", invalid && "input--invalid", className)} {...rest} />;
});

// ============================================================================
// Select
// ============================================================================

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, className, ...rest }, ref) {
  return (
    <div className="select-wrap">
      <select ref={ref} className={classNames("select", className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="select-wrap__caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
});

// ============================================================================
// Switch — controlled checkbox with switch semantics
// ============================================================================

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export const Switch = ({ checked, onChange, disabled, id, ...aria }: SwitchProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <span className="switch">
      <input
        id={inputId}
        className="switch__input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...aria}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </span>
  );
};

// ============================================================================
// Textarea — same chrome as Input
// ============================================================================

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={classNames("input", "input--textarea", className)} {...rest} />;
});

// ============================================================================
// Segmented — a small set of mutually exclusive options
// ============================================================================

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

type SegmentedRole = "radiogroup" | "tablist";

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  size?: "sm" | "md";
  /**
   * `radiogroup` (default) for a value picker; `tablist` only when the control
   * actually drives tab panels that exist in the DOM.
   */
  role?: SegmentedRole;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  role = "radiogroup",
}: SegmentedProps<T>) {
  return (
    <div className={classNames("segmented", `segmented--${size}`)} role={role} aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={role === "tablist" ? "tab" : "radio"}
            aria-checked={role === "tablist" ? undefined : selected}
            aria-selected={role === "tablist" ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            className={classNames("segmented__item", selected && "segmented__item--active")}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const index = options.findIndex((o) => o.value === value);
              const delta = e.key === "ArrowRight" ? 1 : -1;
              const nextIndex = (index + delta + options.length) % options.length;
              const next = options[nextIndex];
              if (!next) return;
              onChange(next.value);
              const group = e.currentTarget.parentElement;
              requestAnimationFrame(() => group?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus());
            }}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
