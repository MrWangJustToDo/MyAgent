# Design — playground shell redesign

## Context

The playground is a Vite host that mounts `@codent/app` inside
`@my-react/react-terminal`'s `InkTerminalBox` (an xterm-backed Ink renderer). The terminal is the
product; the surrounding chrome is host code owned entirely by `packages/playground`.

Two constraints shape every decision below:

- **The terminal is a fixed grid, not a fluid box.** Ink lays out to `columns × rows`; a fluid
  container yields truncated lines. Responsive resizing therefore has to pick *discrete* column
  counts, not a continuous width.
- **`InkTerminalBox` owns its own DOM subtree.** Anything we add must either live outside it or be
  rendered as an overlay above it, and must never remount it while the agent is running.

## Goals

- One coherent visual language across shell, workspace, settings and dialogs.
- The layout stays usable from 768px to ultrawide, degrading predictably.
- Every interactive element is reachable and operable by keyboard.
- Chrome code stays small enough to read: shared primitives, no duplicated control CSS.

## Non-goals

- Redesigning the agent transcript itself — that is `@codent/app`'s surface, not the host's.
- Mobile-grade support below 768px. WebContainer requires a desktop-class Chrome; a narrow layout is
  a courtesy, not a supported target.
- A theme editor. Dark is the product's identity; a light theme is out of scope for this change.

## Decisions

### 1. Design language: precise devtool dark, one accent

Follow the Linear/Vercel devtool idiom, chosen because it reads well around a monospace surface:

- Neutrals do the work. Surfaces step `bg → surface-1 → surface-2 → surface-3` with small,
  deliberate deltas, and depth comes from **hairline borders** (`rgba(255,255,255,.06–.10)`) rather
  than heavy shadows. Shadows are reserved for genuinely floating layers (dialogs, sheets).
- A single accent (indigo `#6366f1` family) carries selection, focus and primary actions. Status
  colours (success / warning / danger / info) are semantic only and never decorative.
- Type scale is tight and fixed (`11 / 12 / 13 / 14 / 20`); the UI is a tool, not a landing page.
- Motion is short (120–200ms) and limited to opacity / small translates. `prefers-reduced-motion`
  removes it entirely.

Rejected: glassmorphism and glow (noisy next to ANSI text), and IDE-dense chrome with an activity
rail (the workspace already has its own tab bar; a second navigation layer would duplicate it).

### 2. Responsive model: one breakpoint owner

`useBreakpoint()` subscribes to a single `matchMedia` set and is the **only** place that reads
viewport width. Components receive the resulting size class (`compact` / `regular` / `wide`) instead
of adding their own media queries, so a layout change has exactly one place to be made.

The shell then reacts:

| Viewport | Shell |
|----------|-------|
| `< 768px` (compact) | Workspace becomes a bottom sheet overlay; top bar collapses action labels to icons; terminal targets 80 columns. |
| `768–1279px` (regular) | Workspace is a resizable side pane at a narrower default; status bar hides secondary telemetry. |
| `≥ 1280px` (wide) | Full top bar, wider default pane, terminal targets 120 columns. |

CSS media queries remain for pure typography/spacing trims, but **never** for layout structure —
structure decisions go through the hook so they stay testable and consistent.

### 3. Terminal sizing: discrete fit modes

`InkTerminalBox` is remounted with a new `termOptions.fontSize` only when the derived *fit mode*
changes (`compact` / `cozy` / `roomy`), not on every resize event — a remount clears scrollback, so
the derived value is memoised on the breakpoint plus a debounced column budget. The column budget is
advisory: it drives font size, and Ink reflows to whatever the box actually measures.

### 4. Splitters: pointer events + keyboard

Both splitters move to Pointer Events with `setPointerCapture` (works with mouse, touch and pen, and
cannot "stick" when the pointer leaves the window), gain `role="separator"` with `aria-valuenow`,
respond to arrow keys, and reset to the default width on double-click.

### 5. Overlays: `Dialog` and `Sheet`

`Dialog` is a centred, backdrop-dismissable surface used by settings and export. `Sheet` is the same
contract anchored to an edge, used by the workspace panel in compact mode. Both share a
`useDismissable` behaviour (Escape, backdrop click, focus trap on open, restore focus on close) so
dismissal semantics cannot drift between the two.

### 6. Stylesheet layering

`src/styles/` replaces the monolith:

| File | Owns |
|------|------|
| `tokens.css` | custom properties only |
| `base.css` | reset, scrollbars, focus, motion preferences |
| `primitives.css` | the shared control layer |
| `shell.css` | top bar, work area, status bar, command palette |
| `workspace.css` | panel, preview, file tree, code tab |
| `settings.css` | settings + export dialogs |
| `variants.css` | variants panel |

Rules: component classes are defined once, no "backwards-compatible alias" block, and any selector
with no emitter in `src/**` is deleted rather than carried.

### 7. Command palette

`Cmd/Ctrl+K` opens a palette over the *host's* actions only (toggle workspace, settings, export,
refresh preview, open preview, switch workspace tab, new terminal font size, reload agent). It is
deliberately not a second entry point for agent slash commands — those already exist in the
composer, and duplicating them would give two sources of truth.

## Risks

- **Terminal remount churn** — mitigated by deriving font size from a memoised fit mode, not raw
  width, and by never remounting on pane drag (drag changes the box, not the mode).
- **Focus management in overlays** — implemented once in `useDismissable` and exercised by both
  overlay types rather than re-implemented per dialog.
- **Spec drift** — `workspace-panel` currently mandates "always visible" and a GitHub-dark Monaco
  theme; both are explicitly modified by this change rather than silently violated.
