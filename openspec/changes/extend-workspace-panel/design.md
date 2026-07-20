## Context

The playground currently has a collapsible preview panel that only shows WebContainer server iframes. Users want a persistent workspace panel with code editing capabilities — similar to bolt.new / v0.

### Key Constraints

- WebContainer is the single source of truth for files — Monaco reads from it and writes to it
- Agent tool calls go through CoreEnv (`fs.writeFile`, `runCommand`)
- User saves in Monaco should not trigger agent auto-refresh (to avoid loops)
- The existing SplitPane component handles the left/right split — no need to reinvent

## Goals / Non-Goals

### Goals
- Always-visible workspace panel with draggable resize
- Multi-tab (Preview + Code)
- Monaco editor with GitHub dark theme, read-write
- File tree with JetBrains icons from `public/assets/`
- Auto-refresh on agent actions
- Ctrl+S and tab-switch save

### Non-Goals
- Git integration, diff view, or source control
- Monaco extensions / VS Code marketplace plugins
- Multiple file tabs within the Code tab (single-file editing)
- File creation / deletion from the file tree (agent does it; tree shows the result)

## Decisions

### Decision: Intercept CoreEnv fs/command wrappers for auto-refresh

**What**: Rather than polling or watching WebContainer internal events, wrap the CoreEnv methods created in `create-env.ts` / `create-fs.ts` with a post-operation callback.

**How**: Add an optional `onChange?: () => void` parameter to `createWebContainerFs` and `runWebContainerCommand`/`execWebContainerCommand`. In `create-env.ts`, pass a callback that emits a custom DOM event (`agent:action`) on the window. The `WorkspacePanel`'s Code tab listens for this event.

**Alternatives considered**:
- Polling WebContainer fs every N seconds — wasteful and slow
- Wrapping the agent's tool functions — too deep in the agent layer, would require modifying `@my-agent/core`
- WebContainer `fs.watch` — WebContainer's in-memory fs does not support fs.watch

### Decision: User saves go directly to WebContainer, not through CoreEnv

**What**: Monaco saves call `wc.fs.writeFile` directly (via the booted WebContainer instance), bypassing CoreEnv entirely. This avoids triggering the agent auto-refresh mechanism.

**How**: The Code tab stores a reference to the booted WebContainer instance (from `getBootedWebContainer()`). On save, it calls the WebContainer's native `fs.writeFile`. The agent-side CoreEnv `fs.writeFile` also calls the same WebContainer fs — both writes end up in the same filesystem, but only the CoreEnv path triggers auto-refresh.

**Alternatives considered**:
- Going through CoreEnv `fs.writeFile` for user saves too — would require a flag to distinguish user vs agent writes, adding complexity
- Using a dedicated React context — unnecessary indirection

### Decision: File tree loads lazily with depth limit

**What**: The file tree does not read the entire WebContainer filesystem upfront. It loads the root level, then expands children on demand. `node_modules` and similar large directories are not expanded by default.

**How**: Each directory node calls `fs.readdir` on expansion. A list of "skip patterns" (`.git`, `node_modules`, `dist`, `.next`) is respected to avoid showing generated cruft.

### Decision: Monaco + @monaco-editor/react

**What**: Use the official `monaco-editor` (v0.52+) and `@monaco-editor/react` React bindings. The GitHub dark theme is loaded from `@monaco-editor/react`'s theme registrations or a CDN.

**Why**: `@monaco-editor/react` is the most widely used React wrapper for Monaco, with built-in Vite support, theme loading, and diff editor.

## Risks / Trade-offs

- **WebContainer performance**: Reading directory trees on every agent action could be slow for large workspaces. Mitigation: debounce auto-refresh (e.g. 300ms) and only re-read the root + current open file's directory.
- **Monaco bundle size**: Monaco adds ~5MB gzipped. Mitigation: lazy-load the Code tab (dynamic import) so it's not loaded until the user clicks the tab.
- **Sync issues**: If agent writes a file while user is editing it in Monaco, the content could become stale. Mitigation: auto-refresh re-reads the open file from WebContainer; if the file was modified by the user but not saved, show a toast warning.

## Open Questions

- Should we add a "Refresh" button in the Code tab header so users can manually refresh the file tree?
- Should we filter out hidden files (dotfiles) from the file tree by default?
