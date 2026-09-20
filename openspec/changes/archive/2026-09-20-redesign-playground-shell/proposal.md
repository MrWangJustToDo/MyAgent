# Redesign the playground shell for responsive, consistent UI

## Why

`@codent/playground` is the browser demo of the whole product, and its chrome has not kept up with
the agent UI it frames. Three problems compound:

1. **No responsive behaviour at all.** `src/style.css` contains zero `@media` / container queries.
   `SplitPane` hard-codes a pixel width for a right pane that is never collapsed, and the terminal
   renderer is mounted at a fixed `fontSize: 14` regardless of viewport. Below ~1100px the workspace
   panel and terminal fight for space; on a tablet the layout overflows.
2. **Three ad-hoc chrome systems, no shared primitives.** A draggable floating settings bubble
   (`use-draggable-bubble.ts`), a right-hand `WorkspacePanel` with its own tab strip, and an
   overlay `ExportWorkspaceDialog` each define their own buttons, inputs, toggles and focus styles.
   The same control looks and behaves differently in each place, and the CSS repeats itself.
3. **A 2055-line monolithic stylesheet** with a "backwards-compatible aliases" block, duplicate
   rules for the same controls, and dead selectors (`.file-tree__item--active-path` is emitted by
   `FileTree.tsx` but never defined; `.config-bubble` styling survives only for the bubble itself).

The result reads as three tools sharing a page rather than one product.

## What Changes

- **New app shell.** A slim top bar (brand, connection/status pill, workspace + settings actions), a
  full-height work area (terminal + workspace), and a status bar. The floating settings bubble is
  removed; settings becomes a proper dialog reachable from the top bar and `Cmd/Ctrl+,`.
- **One design system.** Tokens (surfaces, borders, text, accent, spacing, type, radius, motion,
  elevation) plus shared primitives — `Button`, `IconButton`, `Field`, `Input`, `Select`, `Switch`,
  `Segmented`, `Dialog`, `Sheet` — and a single icon set. Every playground surface uses them.
- **Responsive by container, desktop-first.** A breakpoint owner (`useBreakpoint`) drives the shell:
  the workspace panel is a resizable side pane on wide viewports and a bottom sheet on narrow ones;
  the top bar drops labels before it drops actions; the terminal picks a column count that fits.
- **Keyboard and a11y pass.** Real focus rings, arrow-key `Segmented`, roving tabindex on the file
  tree, labelled tab/tree semantics, `Escape` to close overlays, and keyboard-resizable splitters.
- **Layered stylesheet.** `src/style.css` is replaced by `src/styles/` (tokens → base → primitives →
  shell → feature layers) with dead rules and compatibility aliases deleted.
- **Richer empty / loading / error states** and a real comparison experience in the variants panel.

## Impact

- Affected capability: new `playground-shell`; modified `workspace-panel`.
- Affected code: `packages/playground/src/**` (shell, components, hooks, styles), `index.html`.
- No change to `@codent/core` / `@codent/app` public API, to `CoreEnv`, or to any tool contract.
- No change to the WebContainer boot path, the fetch proxy, or the export/upload logic — those are
  restyled, not re-specified.
