## Why

Every tool's display knowledge lives in **two places that have already drifted**:

- **core** knows the tools (definitions, schemas, `toUI`, `toModelOutput`, registers `display` metadata) but knows nothing about how they render.
- **app** hard-codes the same knowledge in **four name tables** plus three formatter switches. Measured drift today: `TOOL_BUCKET` lacks `todo` / `ask_user` / `complete_plan` / `create_plan` / `update_plan`; `getInlineSummary` lacks `run_command` / `get_command_output` / `kill_command` / `task`; `formatToolInput` lacks `complete_plan`, `memory_*`, `lsp_*`, `code_overview`, `execute_typescript`, `discover_tools`; `formatToolOutput` lacks `tree`, `delete_file`, `memory_*`, `list_skills`, `load_skill`, `lsp_*`, `ast_search`, `code_rewrite`, `execute_typescript`, `discover_tools`.

Concrete symptoms already shipped/fixed because of that drift: extension tools folded into an opaque `N other` (`d15bd29`), and completed `todo` / `ask_user` / `complete_plan` rows were folded away although the render layer wanted to keep their blocks (two app tables contradicting each other).

A second, structural symptom: display knowledge and the registries that hold it (`toUI`, `display`) live in the **process that runs core**, while rendering runs in the app. In remote-core modes (server CoreEnv, remote Agent Session, playground/extension hosts) the app's registry lookups are empty, so **extension output blocks do not render in `full` mode either** — a latent bug that only shows up off-process.

## What Changes

- **core owns tool presentation descriptors.** One property — `present` (fold category, keep-row/detailed flags, header summary, input label, result text) — declared where the tool is defined: built-ins at their definition sites, extensions through `registerTool`. Today's two extension fields (`toUI`, `display`) are **removed without aliases** (breaking for extensions, demos + docs updated in the same change) and their two registries are folded into one presentation registry.
- **core precomputes per-call display and attaches it to the UI message part.** At tool completion core renders the descriptor's text/summary/label from the stored output and attaches them to that tool-call part as a top-level `display` field (never inside `output`, which is the tool's own data contract and — without a `toModelOutput` transform — the model's view of the result). Parts travel to every host unchanged, so `full` **and** `compact` display work off-process with no per-render registry lookup and no async round-trip.
- **core publishes a serializable descriptor catalog in the session snapshot** so hosts can render rows that have no payload yet (executing tools, older messages) and can share extension-registered metadata across processes.
- **app keeps only ink/theme rendering.** The four name tables and three formatter switches are deleted; view components read `part.display` plus the catalog. Theme colors, ANSI styling, diff views, and window/layout helpers stay in the app.
- **app cache signatures cover the new payload.** `encodeToolCallState` / `encodePartRenderSignature` / `computeMessageRenderSignature` and `MessageList`'s dynamic signature currently fingerprint only `id/state/hasOutput/approval`; a display-only update would not invalidate them, so they must include the payload (same class of bug as the flat-cache staleness fixed in `73d5d95`).
- **Boundary docs/validators updated** (`validate:core-imports` allowlist, `packages/app/README.md` boundary section, `AGENTS.md`, extension README/demo).
- **No compatibility layer.** Single `present` property, no aliases for `toUI`/`display`, no snapshot shim, and no history migration/backfill: parts written before this change render from the catalog instead.

## Capabilities

### New Capabilities

- `tool-presentation`: single source of truth for per-tool display descriptors in core; registry merge of built-in + registered metadata; serializable catalog published on the session snapshot; per-call `display` payload computed by core and attached to the tool-call part.

### Modified Capabilities

- `unified-message-chain`: tool-call parts carry the core-computed `display` payload; it is part of the durable chain, must survive part rebuilds/merges, must invalidate host render caches when it changes, and must never reach the model wire.

## Impact

| Area | Change |
|------|--------|
| `packages/core` | New `agent/tools/presentation/` (descriptor types, registry, pure formatters moved out of app); `to-ui-registry.ts` + `tool-display-registry.ts` deleted; built-in tools declare `present` (~30 definition sites across `agent/tools/*`, `agent/plan`, `agent/todo`, `agent/subagent`, `agent/lsp|memory|skills|code-mode`); `early-tool-result-ui-middleware` + `AgentUIChannel.attachToolDisplay` write `part.display`; session snapshot gains `toolDescriptors`; `session:extensions` retained event gains per-tool metadata |
| `packages/app` | Delete `TOOL_BUCKET`, the inline-summary/detail/output/input switches and the `getInlineSummary` / `formatToolOutput` / `formatToolInput` implementations (keep thin re-exports only where tests need them); `ToolCallPartView` / `ToolOutputView` / `ToolInputView` / `ToolStatusIcon` / `tool-timing-store` / `project-transcript` read the payload + catalog; render signatures include it |
| `packages/server` | Session snapshot route serializes the new field (no route change expected); covered by a snapshot round-trip check |
| Tests | app `utils` / `tool-activity-summary` / `project-transcript` / `format-tool-output-to-ui` suites move their expectations to core; new core unit tests for descriptors, formatters, and `display` attachment; remote-mode snapshot round-trip test |
| Docs | `AGENTS.md` (`### Streaming UI`, tool definition pattern), `packages/app/README.md` boundary section, `examples/extensions/README.md` |
| Extensions | **Breaking**: `toUI` / `display` removed in favour of `present`; `examples/extensions/demo-echo-tool.mjs` + `demo-pi-like.mjs` and the extension README are updated in the same change |
| Risk | Not a user-visible redesign: expected rendering is byte-identical for local CLI (same strings, same tables), the win is correctness off-process plus no future drift |
