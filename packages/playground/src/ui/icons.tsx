import type { SVGProps } from "react";

/**
 * One inline icon set for the whole playground shell.
 *
 * Every icon is a 16x16 stroke glyph on a `currentColor` stroke, so a control's
 * colour decides the icon's colour and no per-component SVG copies are needed.
 * `Icon` normalises size/stroke so call sites only choose the glyph.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered box in px. Defaults to 14, the shell's control-icon size. */
  size?: number;
  /** Stroke width. Defaults to 1.5, tuned for the 16px grid. */
  strokeWidth?: number;
  /**
   * Source viewBox. Defaults to the shell's 16-unit grid; glyphs lifted verbatim
   * from a 24-unit set pass `"0 0 24 24"` rather than being rescaled by hand
   * (hand-scaling path coordinates is how the settings gear got mangled).
   */
  viewBox?: string;
}

const base = ({ size = 14, strokeWidth = 1.5, viewBox = "0 0 16 16", ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox,
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...rest,
});

export const IconTerminal = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
    <path d="M4.75 6.5 6.5 8.25l-1.75 1.75M8.5 10h3" />
  </svg>
);

/**
 * Gear, taken verbatim from the 24-unit Feather set (centred on 12,12).
 *
 * Kept at its native viewBox on purpose: the previous 16-unit rewrite was a
 * hand-rescaled copy of this path and rendered as a broken starburst.
 */
export const IconSettings = ({ strokeWidth = 1.6, ...p }: IconProps) => (
  <svg {...base({ ...p, viewBox: "0 0 24 24", strokeWidth })}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconPanel = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" />
    <path d="M10 2.5v11" />
  </svg>
);

export const IconCommand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.5 2.5a2 2 0 1 0 0 4h5a2 2 0 1 0 0-4v11a2 2 0 1 0 0-4h-5a2 2 0 1 0 0 4Z" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </svg>
);

export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" />
    <path d="M1.75 5.75h12.5" />
    <circle cx="4" cy="4.1" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="6" cy="4.1" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1.4" />
    <rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1.4" />
    <rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1.4" />
    <rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1.4" />
  </svg>
);

export const IconCode = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5" />
  </svg>
);

export const IconFile = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 1.75h4.75L12.25 5.5v8.75a1 1 0 0 1-1 1h-7.25a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z" />
    <path d="M8.5 1.75V5.5h3.75" />
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 10.25V2.5m0 0L5 5.5M8 2.5l3 3" />
    <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
  </svg>
);

export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M1.75 4.25a1.5 1.5 0 0 1 1.5-1.5h2.6a1.5 1.5 0 0 1 1.06.44l.84.86h4.75a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9.25a1.5 1.5 0 0 1-1.5-1.5Z" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 2.5v7.75m0 0 3-3m-3 3-3-3" />
    <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.53-3.71" />
    <path d="M13.25 2.25V5.5H10" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 3.25H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
    <path d="M9.5 2.25h4.25V6.5M13.25 2.75 7.75 8.25" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5.75" y="5.75" width="8" height="8" rx="1.4" />
    <path d="M10.25 5.75v-2.4a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v5.75a1 1 0 0 0 1 1h2.25" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5 6.5 11.5 12.5 4.75" />
  </svg>
);

export const IconSparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 1.75l1.7 3.6 3.55.55-2.6 2.6.63 3.75L8 10.4l-3.28 1.85.63-3.75-2.6-2.6L6.3 5.35Z" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 1.75 14.25 5 8 8.25 1.75 5Z" />
    <path d="M2.75 8 8 10.75 13.25 8M2.75 10.75 8 13.5l5.25-2.75" />
  </svg>
);

export const IconWarning = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7.13 2.6 1.6 12.15a1 1 0 0 0 .87 1.5h11.06a1 1 0 0 0 .87-1.5L8.87 2.6a1 1 0 0 0-1.74 0Z" />
    <path d="M8 6.25v3M8 11.4h.01" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7.25" cy="7.25" r="4.5" />
    <path d="M10.75 10.75 13.75 13.75" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M1.5 8S3.75 3.75 8 3.75 14.5 8 14.5 8 12.25 12.25 8 12.25 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.75 4.25h10.5M6.25 4.25V2.75a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.5" />
    <path d="M4 4.25 4.6 13a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95l.6-8.75" />
  </svg>
);
