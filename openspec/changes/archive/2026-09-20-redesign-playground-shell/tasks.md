# Tasks

## 1. Tokens and base layer

- [x] 1.1 Create `src/styles/tokens.css` (surfaces, borders, text, accent, status, spacing, type, radius, elevation, motion)
- [x] 1.2 Create `src/styles/base.css` (reset, scrollbars, focus-visible, `prefers-reduced-motion`)
- [x] 1.3 Delete `src/style.css` and switch `main.tsx` to the layered entry

## 2. Shared primitives

- [x] 2.1 `src/ui/icons.tsx` — one inline icon set (no per-component SVG copies)
- [x] 2.2 `src/ui/Button.tsx` — variants `primary` / `secondary` / `ghost` / `danger`, sizes, icon slots
- [x] 2.3 `iconOnly` mode with a required accessible name on `Button`
- [x] 2.4 `src/ui/Field.tsx` — `Field` / `Input` / `Textarea` / `Select` / `Switch` / `Segmented` (label auto-association)
- [x] 2.5 `src/ui/Dialog.tsx` + `src/ui/Sheet.tsx` + `src/ui/use-dismissable.ts` (topmost-only Escape, focus trap, restore)
- [x] 2.6 `src/styles/primitives.css`

## 3. Responsive foundation

- [x] 3.1 `src/hooks/use-breakpoint.ts` — single `matchMedia` owner returning `compact` / `regular` / `wide`
- [x] 3.2 `src/hooks/use-media-query.ts` helper used only by the breakpoint hook
- [x] 3.3 `src/hooks/use-terminal-fit.ts` — terminal metrics; font size is stable so resize never remounts the terminal

## 4. App shell

- [x] 4.1 `src/shell/TopBar.tsx` (brand, status pill, workspace + settings actions, palette hint)
- [x] 4.2 `src/shell/StatusBar.tsx` (workspace root, connection mode, ports, column budget)
- [x] 4.3 `src/shell/AppShell.tsx` — composition + responsive orchestration (terminal is a stable tree node)
- [x] 4.4 `src/shell/AgentSurface.tsx` — agent lifecycle + terminal, with boot/error states
- [x] 4.5 `src/styles/shell.css`

## 5. Command palette

- [x] 5.1 `src/shell/CommandPalette.tsx` — presentational list + `filterCommands`, `Cmd/Ctrl+K`
- [x] 5.2 Commands are host actions only (workspace / overlays / preview / agent), built in `AppShell`

## 6. Settings

- [x] 6.1 `src/components/SettingsDialog.tsx` on primitives, with dirty tracking and validation
- [x] 6.2 Removed `ConfigPanel.tsx` + `use-draggable-bubble.ts`; opened from the top bar, `Cmd/Ctrl+,` and the palette
- [x] 6.3 `src/styles/settings.css` (settings + export dialog)

## 7. Workspace panel

- [x] 7.1 `SidePanel` — pointer capture, keyboard resize, `aria-valuenow`, double-click reset, persisted width
- [x] 7.2 `WorkspacePanel` — pane on `regular`/`wide`, bottom sheet on `compact`
- [x] 7.3 Preview tab: port pills, ready/pending states, empty placeholder, icon action group
- [x] 7.4 `FileTree` — roving tabindex, full arrow-key navigation, skeleton loading, dead `--active-path` class dropped
- [x] 7.5 `WorkspaceCodeTab` — restyled on primitives, skeleton editor, toasts for upload/save
- [x] 7.6 `ExportWorkspaceDialog` on `Dialog` + primitives
- [x] 7.7 `src/styles/workspace.css`

## 8. Variants panel

- [x] 8.1 Composer on primitives with a shared count control and disabled explanation
- [x] 8.2 Grid compare mode alongside the single stage
- [x] 8.3 Real scan/empty states instead of a bare "No variants yet"
- [x] 8.4 `src/styles/variants.css`

## 9. Docs

- [x] 9.1 Update `packages/playground/README.md` (shell, settings entry points, responsive behaviour, shortcuts, styling)

## 10. Verification

- [x] 10.1 `pnpm typecheck`
- [x] 10.2 `pnpm lint`
- [x] 10.3 `pnpm build:core && pnpm build:app && pnpm build:playground`
- [x] 10.4 `pnpm --filter @codent/playground validate:*` (all four pass)
- [x] 10.5 Manual pass at 768 / 1024 / 1440 / 1920 px: no overflow, panel collapses, palette + settings keyboard-operable
