# Tasks

## 1. Core: descriptor infrastructure (no behavior change)

- [x] 1.1 `packages/core/src/agent/tools/presentation/types.ts` — `ToolPresentation` (category / keepRow / detailed / clientSide / summary / label / text / input) + `ToolActivityCategory`; document the purity requirement (functions of the stored output / parsed input only)
- [x] 1.2 `presentation/registry.ts` — `declareToolPresentation` / `registerToolPresentation` / `getToolPresentation` / `describeToolPresentations` / `clearToolPresentation` + resolution order (registered → per-tool declaration → built-in fallback table)
- [x] 1.2b **Deleted** `agent/tools/runtime/to-ui-registry.ts` and `agent/tools/runtime/tool-display-registry.ts` (their `register*` / `get*` / `clear*` exports and the old `index.ts` re-exports are replaced by the presentation registry; no aliases kept)
- [x] 1.3 `presentation/builtin-table.ts` — the built-in name table moved out of `tool-activity-summary.ts` (`TOOL_BUCKET`) + keep-row/detailed sets moved out of `tool-display.ts`; the app's copy is deleted from `tool-activity-summary.ts`. The table stays as a **safety net** (a renderer that runs before the snapshot catalog lands, tests, third-party tools reusing a built-in name) and `validate:tool-presentation` asserts it never drifts from the declarations
- [x] 1.4 Ported the pure formatters into core (`activity-summary`, `output-format`, `input-format`, `tool-state`, `inline-summary` + `lines` / `format` helpers). The app still keeps its own copies (deleted in stage 5), so behavior is unchanged:
  - `presentation/activity-summary.ts` ← `tool-activity-summary.ts` (bucket lookup, `shouldKeepToolRow`/`shouldFoldToolRow`, counts, `collectOtherToolNames`, summary/label text, `formatExploredActivitySummary`)
  - `presentation/output-format.ts` ← `tool-output-format.ts` (`formatToolOutput` — the `getToUI` lookup becomes `present.text` — plus `formatToolArgs`)
  - `presentation/input-format.ts` ← non-ANSI branches of `tool-input-format.ts` (`formatToolInput`, plain text)
  - `presentation/tool-state.ts` ← `tool-part.ts` (`isToolCallPart`, `uiState`, `parseToolInput`, `isToolExecuting`, …)
  - `presentation/inline-summary.ts` ← `getInlineSummary` + `getCompactOutput` + `getDurationMs` + duration thresholds
- [x] 1.5 `defineServerTool` and `defineClientTool` accept `present?: ToolPresentation` and declare it (`declareToolPresentation`)
- [x] 1.6 Exported from `@my-agent/core`: the descriptor API, `keepsCompactRow`, the ported formatters, and the types `ToolPresentation` / `ToolPresentationInfo` / `ToolDisplayPayload` / `DisplayToolCallPart` (hosts read `part.display` directly — no accessor helper)
- [x] 1.6b Migrated callers of the removed API: `managers/services/extension-registry-service.ts`, `extension/types.ts` (`toUI` / `display` fields replaced by `present`), `define-tool.ts`, `examples/extensions/demo-echo-tool.mjs` + `demo-pi-like.mjs`, the app files that imported `getToUI` / `getToolDisplay`, and the three app test suites
- [x] 1.7 Coverage instead of a new core test suite (core has no test runner): `validate:tool-presentation` guards the declarations against the fallback table, and `packages/app/test/{utils,format-tool-output-to-ui,tool-activity-summary,project-transcript}.test.mjs` keep asserting the rendered behavior against the core-owned implementations

## 2. Core: built-in tools declare their own descriptors

- [x] 2.1 `agent/tools/*`: read_file, list_file, tree, edit_file, write_file, delete_file, grep, glob, websearch, webfetch, run_command, get_command_output, kill_command (+ `ask_user` via `defineClientTool`)
- [x] 2.2 `agent/todo/todo-tool.ts`, `agent/plan/create-plan-tool.ts` (create/update via the factory, complete), `agent/subagent/task-tool.ts`
- [x] 2.3 Extension-backed built-ins: `agent/lsp/tools/*` (10 sites incl. `code_overview` / `code_rewrite` / `ast_search`), `agent/memory/extension.ts` (3), `agent/skills/extension.ts` (2) declare `present`; `execute_typescript` and `discover_tools` are assembled at runtime, so the fallback table owns them (`DYNAMIC_TABLE_ONLY` in the drift guard). Note: these factories return unannotated object literals, so their literals need `as const` to stay assignable to `ExtensionToolDefinition`
- [x] 2.4 Parity verified mechanically rather than by sampled output snapshots: every ported implementation is byte-identical to the app original. `diff` reports only the expected deltas — imports for `activity-summary.ts` / `output-format.ts`, the chalk removal in `input-format.ts` (`$` prefix back to plain text), and **zero** differences for `tool-state.ts`; `getInlineSummary` / `getCompactOutput` / `getDurationMs` and the duration thresholds are identical verbatim. The app suite (84 assertions on exact rendered strings) re-checks these same bodies the moment the app switches to the core-owned implementations in 5.5
- [x] 2.5 Drift guard: `packages/core/scripts/validate-tool-presentation.mjs` (+ `validate:tool-presentation`) — every fallback-table name must be declared at its definition site with identical values, names still awaiting migration live in `PENDING_DECLARATIONS` and that list must shrink (verified with a negative test)

## 3. Core: per-call `display` payload

- [x] 3.1 `agent/ui-channel.ts`: `attachToolDisplay(toolCallId, display: ToolDisplayPayload)` patches the matching tool-call part via `getMessages` / `setMessages` (mirrors `applyToolDenialReason`); `addToolResult` signature unchanged
- [x] 3.2 `early-tool-result-ui-middleware.ts`: after `addToolResult` (success **and** failure branch) it renders `computeToolDisplay(name, output, input)` — new `presentation/compute-display.ts` — and attaches `{ text, summary, label }` as the part's top-level `display`, never inside `output`. `text` prefers `present.text`, then the built-in output switch; `summary` prefers `present.summary`, then the built-in inline summary; deterministic (pure functions of the stored output)
- [x] 3.3 Covered the non-early path too (batched tool phase / denial / error / incomplete tool) so every completed part gets the payload where a renderer exists
- [x] 3.4 validate-tool-display covers the payload, is deterministic across runs, is absent when no renderer exists, and never appears in the model messages (`uiMessagesToModelMessages` output)

## 4. Core: serializable catalog on the session snapshot

- [x] 4.1 `ToolPresentationInfo` projection from the registry (no functions); publish as `snapshot.toolDescriptors`
- [x] 4.2 Wire it through: `agent-session/types.ts` snapshot shape, `local-session-snapshot.ts`, a retained `session:tool-presentation` event (`agent-event-bus/types.ts` + `meta.ts` + `managed-agent.ts`), and per-tool metadata in `ExtensionInfo.tools`
- [x] 4.3 `remote-session-client.ts`: carry the new field in `emptySnapshot` + `applyEvent`
- [x] 4.4 `packages/server` snapshot round-trip check (route serializes `getSnapshot()`) — add to the server validate set
- [x] 4.5 Test: catalog contents for built-ins + an extension tool; disabled extension drops its entries

## 5. App: consume, then delete the tables

- [x] 5.1 Cache correctness first: include a `part.display` digest in `encodeToolCallState` / `encodePartRenderSignature` / `computeMessageRenderSignature` / `MessageList`'s dynamic signature; merge `display` in `mergeToolCallPart`
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
