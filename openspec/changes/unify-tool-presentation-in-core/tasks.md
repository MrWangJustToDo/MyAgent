# Tasks

## 1. Core: descriptor infrastructure (no behavior change)

- [ ] 1.1 `packages/core/src/agent/tools/presentation/types.ts` — `ToolPresentation` (category / keepRow / detailed / clientSide / summary / label / text / input) + `ToolActivityCategory`; document the purity requirement (functions of the stored output / parsed input only)
- [ ] 1.2 `presentation/registry.ts` — `registerToolPresentation` / `getToolPresentation` / `clearToolPresentation` + resolution order (registered → per-tool declaration → built-in fallback table); `clear` on session restore, mirroring the existing registries
- [ ] 1.2b **Delete** `agent/tools/runtime/to-ui-registry.ts` and `agent/tools/runtime/tool-display-registry.ts` (their `register*` / `get*` / `clear*` exports and the `@my-agent/core` re-exports at `index.ts:212-219` are replaced by the presentation registry; no aliases kept)
- [ ] 1.3 `presentation/fallback-table.ts` — the built-in name table moved out of `tool-activity-summary.ts` (`TOOL_BUCKET`) + keep-row/detailed sets moved out of `tool-display.ts`; **single** copy, no app duplicate
- [ ] 1.4 Port pure formatters into core, deleting the app equivalents:
  - `presentation/activity-summary.ts` ← `tool-activity-summary.ts` (bucket lookup, `shouldKeepToolRow`/`shouldFoldToolRow`, counts, `collectOtherToolNames`, summary/label text, `formatExploredActivitySummary`)
  - `presentation/output-format.ts` ← `tool-output-format.ts` (`formatToolOutput` — the `getToUI` lookup becomes `present.text` — plus `formatToolArgs`)
  - `presentation/input-format.ts` ← non-ANSI branches of `tool-input-format.ts` (`formatToolInput`, plain text)
  - `presentation/tool-state.ts` ← `tool-part.ts` (`isToolCallPart`, `uiState`, `parseToolInput`, `isToolExecuting`, …)
  - `presentation/inline-summary.ts` ← `getInlineSummary` + `getCompactOutput` + `getDurationMs` + duration thresholds
- [ ] 1.5 `defineServerTool` accepts `present?: ToolPresentation` and registers it (`define-tool.ts`); **remove** the `toUI?` / `display?` config fields, the `registerToUI` / `registerToolDisplay` calls, and the `toUI` / `display` fields of `ExtensionToolDefinition` — extension `registerTool({ present })` registers the same object (breaking change, no aliases)
- [ ] 1.6 Export from `@my-agent/core`: descriptor API (`registerToolPresentation` / `getToolPresentation` / `clearToolPresentation` / `describeToolPresentations`), the pure formatters, and the types `ToolPresentation` / `ToolPresentationInfo` / `ToolDisplayPayload` / `DisplayToolCallPart` (hosts read `part.display` directly — no accessor helper)
- [ ] 1.6b Migrate callers of the removed API: `managers/services/extension-registry-service.ts` (`toUI`/`display` pass-through), `examples/extensions/demo-echo-tool.mjs` + `demo-pi-like.mjs`, and the app tests that import `registerToUI` / `clearToUI` / `getToolDisplay`
- [ ] 1.7 Core unit tests: resolution order, fallback table, each formatter vs the app's old expectations (port `packages/app/test/utils.test.mjs`, `format-tool-output-to-ui.test.mjs`, `tool-activity-summary.test.mjs` assertions to core)

## 2. Core: built-in tools declare their own descriptors

- [ ] 2.1 `agent/tools/*`: read_file, write_file, edit_file, delete_file, list_file, tree, glob, grep, run_command, get_command_output, kill_command, websearch, webfetch, ask_user
- [ ] 2.2 `agent/todo/todo-tool.ts`, `agent/plan/create-plan-tool.ts` (create/update/complete), `agent/subagent/task-tool.ts`
- [ ] 2.3 Extension-backed built-ins: `agent/lsp/*`, `agent/memory/extension.ts`, `agent/skills/extension.ts`, code-mode (`execute_typescript`), discovery (`discover_tools`, `__lazy__tool__discovery__`)
- [ ] 2.4 Verify parity: a table-driven test comparing rendered output of every built-in against the pre-migration app implementation for representative outputs (snapshot of the old strings, checked in)

## 3. Core: per-call `display` payload

- [ ] 3.1 `agent/ui-channel.ts`: `attachToolDisplay(toolCallId, display: ToolDisplayPayload)` (patch the part via the processor's `getMessages`/`setMessages`); keep `addToolResult` signature unchanged
- [ ] 3.2 `early-tool-result-ui-middleware.ts`: after `addToolResult` compute `{ text, summary, label }` from the descriptor + result and attach it as the part's top-level `display` (never inside `output`)
- [ ] 3.3 Cover the non-early path too (batched tool phase / denial / error / incomplete tool) so every completed part gets the payload where a renderer exists
- [ ] 3.4 Test: payload is attached, is deterministic across runs, is absent when no renderer exists, and never appears in the model messages (`uiMessagesToModelMessages` output)

## 4. Core: serializable catalog on the session snapshot

- [ ] 4.1 `ToolPresentationInfo` projection from the registry (no functions); publish as `snapshot.toolDescriptors`
- [ ] 4.2 Wire it through: `agent-session/types.ts` snapshot shape, `local-session-snapshot.ts`, a retained `session:tool-presentation` event (`agent-event-bus/types.ts` + `meta.ts` + `managed-agent.ts`), and per-tool metadata in `ExtensionInfo.tools`
- [ ] 4.3 `remote-session-client.ts`: carry the new field in `emptySnapshot` + `applyEvent`
- [ ] 4.4 `packages/server` snapshot round-trip check (route serializes `getSnapshot()`) — add to the server validate set
- [ ] 4.5 Test: catalog contents for built-ins + an extension tool; disabled extension drops its entries

## 5. App: consume, then delete the tables

- [ ] 5.1 Cache correctness first: include a `part.display` digest in `encodeToolCallState` / `encodePartRenderSignature` / `computeMessageRenderSignature` / `MessageList`'s dynamic signature; merge `display` in `mergeToolCallPart`
- [ ] 5.2 `ToolCallPartView` / `ToolOutputView` / `ToolInputView` / `ToolStatusIcon` / `tool-timing-store`: read `part.display` + catalog, keep ink/theme logic; `clientSide` replaces `CLIENT_TOOL_NAMES`
- [ ] 5.3 `project-transcript.ts`: keep the projection loop, take fold decisions + labels from core
- [ ] 5.4 Delete `TOOL_BUCKET`, the two name sets, and the `getInlineSummary` / `formatToolOutput` / `formatToolInput` switch bodies from the app; keep thin re-exports only where public API stability matters
- [ ] 5.5 Re-point app tests (`utils.test.mjs`, `format-tool-output-to-ui.test.mjs`, `tool-activity-summary.test.mjs`, `dedupe-tool-calls.test.mjs`, `project-transcript.test.mjs`, `get-messages.test.mjs`) at the core-owned implementations

## 6. Boundary, docs, extension surface

- [ ] 6.1 `packages/app/README.md`: update the core-import boundary table (presentation formatters move back to core; **state why** — cross-process correctness + drift) and the "pure presentation helpers" note
- [ ] 6.2 `AGENTS.md`: `### Tool Definition Pattern` (declare `present`), `### Streaming UI` (compact contract now core-owned + `part.display`), architecture layer descriptions
- [ ] 6.3 `examples/extensions/README.md` + `demo-echo-tool.mjs`: document `toUI` (+ `display`) as the way to own a compact row, and that the text is precomputed and shipped to the host
- [ ] 6.4 `validate:core-imports` allowlist refresh (new core symbols imported by the app)

## 7. Verification

- [ ] 7.1 `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm --filter @my-agent/app test`
- [ ] 7.2 Core validate subset: `tanstack-tools`, `early-tool-result-ui`, `incomplete-tool-calls`, `tool-phase-utils`, `tool-compact`, `extensions-middleware`, `extension-*` set, `plan-tools`, `command-job-registry`
- [ ] 7.3 Local CLI manual pass: built-in rows unchanged in `full`; compact still folds/keeps per the fixed rules; extension tool (`ext_echo`) shows its `toUI` line in **both** modes
- [ ] 7.4 Remote pass (`--remote-session` against a local server): extension tool text and compact folding behave the same as local — the regression this change exists for
- [ ] 7.5 Snapshot/JSONL check: `.session.jsonl` carries `display`, restoring the session renders without recomputation
