# Change: Extend Preview Panel to Multi-tab Workspace Panel

## Why

The playground's preview panel is currently limited to showing WebContainer server previews. Expanding it to a persistent, multi-tab workspace panel with Code (file tree + Monaco editor) and Preview tabs brings the playground closer to the bolt.new / v0 experience — users can inspect and edit files alongside the live preview without leaving the browser.

## What Changes

- **Rename**: `PreviewPanel` / `PreviewToggle` → `WorkspacePanel` (always visible, draggable resize via `SplitPane`)
- **Multi-tab**: Workspace panel has a tab bar: "Preview" and "Code"
- **Code tab**: File tree sidebar (VS Code style, JetBrains icons) + Monaco editor (GitHub dark theme)
- **Auto-refresh**: File tree and editor reload when agent tool calls write files or run commands — without causing refresh loops
- **Save**: Monaco edits are saved to WebContainer via Ctrl+S or on tab switch; user saves do NOT trigger agent auto-refresh
- **Removed**: `PreviewToggle` floating button (panel is always visible now)

## Impact

- Affected specs: `workspace-panel` (new capability)
- Affected code:
  - `packages/playground/src/components/PreviewPanel.tsx` — rewritten as `WorkspacePanel.tsx`
  - `packages/playground/src/App.tsx` — wiring changes (always-visible panel)
  - `packages/playground/src/style.css` — new CSS classes
  - `packages/playground/src/hooks/use-preview-ports.ts` — simplified (no panel toggle)
  - `packages/playground/package.json` — add `monaco-editor`, `@monaco-editor/react`
  - New: `WorkspaceCodeTab.tsx`, `FileTree.tsx`, `use-refresh-on-agent-action.ts`
