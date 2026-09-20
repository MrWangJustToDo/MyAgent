import { forwardRef } from "react";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Glyph rendered before the label. */
  icon?: ReactNode;
  /** Glyph rendered after the label. */
  trailingIcon?: ReactNode;
  /** Render label-less; `aria-label` becomes required for a11y. */
  iconOnly?: boolean;
}

const classNames = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, trailingIcon, iconOnly, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={classNames("btn", `btn--${variant}`, `btn--${size}`, iconOnly && "btn--icon-only", className)}
      {...rest}
    >
      {icon}
      {!iconOnly && children != null && <span className="btn__label">{children}</span>}
    </button>
  );
});
