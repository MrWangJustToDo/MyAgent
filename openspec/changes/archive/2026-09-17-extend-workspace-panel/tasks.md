## 1. Setup & Rename

- [x] 1.1 Install `monaco-editor` and `@monaco-editor/react`
- [x] 1.2 Rename `PreviewPanel.tsx` → `WorkspacePanel.tsx`; rename component to `WorkspacePanel`
- [x] 1.3 Remove `PreviewToggle` component and its CSS
- [x] 1.4 Make SplitPane right panel always visible in `App.tsx` (remove `panelOpen` gating; `visible` always true)

## 2. Multi-tab header

- [x] 2.1 Add tab bar to `WorkspacePanel` header: "Preview" and "Code" tabs
- [x] 2.2 Style active/inactive tabs (new `.workspace-panel__tab` / `--active` styles)
- [x] 2.3 Keep "No ports" placeholder in Preview tab when no WebContainer ports are detected
- [x] 2.4 Remove the "Close" button from Preview tab actions (panel is always visible)

## 3. File tree component

- [x] 3.1 Create `FileTree.tsx` — recursive tree reading from WebContainer fs
- [x] 3.2 Lazy-load children only on directory expansion, skip `node_modules`/`.git`/`dist`/`.next`
- [x] 3.3 Create icon mapping: file extension → JetBrains SVG from `public/assets/icons/file/`
- [x] 3.4 Create folder icon mapping: folder name → variant from `public/assets/icons/folder/`, fallback to `folder_dark.svg`
- [x] 3.5 Click a file entry → emit it to the parent (Code tab) as "selected file"

## 4. Monaco editor component

- [x] 4.1 Create `WorkspaceCodeTab.tsx` — contains the Monaco editor
- [x] 4.2 Configure Monaco with GitHub dark theme (`github-dark-default`)
- [x] 4.3 Load file content from WebContainer on file selection
- [x] 4.4 Save on Ctrl+S / Cmd+S: write to WebContainer via `getBootedWebContainer().fs.writeFile`
- [x] 4.5 Auto-save on tab switch: save modified content before switching tabs
- [x] 4.6 Show a brief "Saved" indicator after save

## 5. Agent action auto-refresh

- [x] 5.1 `onChange` callback added to `createWebContainerFs` / `runWebContainerCommand` / `execWebContainerCommand` / `startWebContainerCommand`
- [x] 5.2 Wired in `create-env.ts` — passes `dispatchChange` that dispatches `agent:action` CustomEvent on `window`
- [x] 5.3 `WorkspacePanel` listens for `agent:action` → increments `refreshKey` → `FileTree` + `WorkspaceCodeTab` re-read from WebContainer
- [x] 5.4 User saves go directly through `wc.fs.writeFile` (not CoreEnv), so they bypass `onChange` — no auto-refresh loop

## 6. CSS & Polish

- [x] 6.1 Add all new CSS classes: `.workspace-panel`, `.workspace-code-tab`, `.file-tree`, `.file-tree__item`, etc.
- [x] 6.2 Removed all `.preview-panel__*` and `.preview-toggle` CSS
- [x] 6.3 Dark theme consistency throughout

## 7. Verification

- [x] 7.1 `pnpm build:playground` passes
- [ ] 7.2 Manually verify: panel always visible, tabs switch correctly
- [ ] 7.3 Manually verify: file tree reads WebContainer, Monaco loads files
- [ ] 7.4 Manually verify: Ctrl+S saves to WebContainer
- [ ] 7.5 Manually verify: agent actions trigger auto-refresh
