# Design — tool presentation unified in core

## 1. Current state (verified inventory)

### 1.1 App-side tool knowledge — the four name tables

| # | Location | Shape | Complete name list | Consumers |
|---|----------|-------|--------------------|-----------|
| T1 | `packages/app/src/utils/tool-activity-summary.ts:34-81` | `TOOL_BUCKET: Record<string, ToolActivityBucket>` | reads: `read_file, list_file, tree, lsp_definition, lsp_references, lsp_hover, lsp_symbols, code_overview, memory_read, load_skill`; edits: `edit_file, write_file, delete_file, lsp_rename, code_rewrite, memory_write`; searches: `grep, glob, websearch, webfetch, lsp_diagnostics, lsp_completions, lsp_code_actions, ast_search, memory_list, list_skills, discover_tools`; commands: `run_command, get_command_output, kill_command, execute_typescript`; tasks: `task`. **Missing:** `ask_user, todo, create_plan, update_plan, complete_plan` | `getToolActivityBucket` (`:130`) → fold summary |
| T2 | `packages/app/src/utils/tool-display.ts:15,18` | `ALWAYS_VISIBLE_TOOL_NAMES`, `DETAILED_OUTPUT_TOOL_NAMES` | `{ask_user, todo, complete_plan}` / `{run_command, get_command_output, kill_command, task}` | `messages/ToolOutputView.tsx:10,33,54,70`; `utils/tool-activity-summary.ts:107` |
| T3 | `packages/app/src/utils/tool-display.ts:83-263` | `getInlineSummary` switch, 30 cases | `read_file, list_file, grep, glob, write_file, edit_file, delete_file, todo, create_plan, update_plan, complete_plan, websearch, webfetch, tree, lsp_diagnostics, lsp_definition, lsp_references, lsp_symbols, lsp_completions, lsp_code_actions, lsp_hover, ast_search, code_overview, code_rewrite, lsp_rename, memory_list, memory_read, memory_write, list_skills, load_skill`. **Missing:** `run_command, get_command_output, kill_command, task, ask_user, execute_typescript, discover_tools` | `messages/ToolCallPartView.tsx:108` |
| T4 | `packages/app/src/utils/tool-output-format.ts:266-327` (with `getToUI` at `:256`) | `formatToolOutput` switch, 18 cases + `default: ""` | `list_file, run_command, get_command_output, kill_command, read_file, write_file, edit_file, glob, grep, todo, task, create_plan, update_plan, complete_plan, websearch, webfetch, ask_user`. **Missing:** `tree, delete_file, memory_*, list_skills, load_skill, lsp_*, ast_search, code_rewrite, execute_typescript, discover_tools` | `messages/ToolOutputView.tsx:55` |
| T5 | `packages/app/src/utils/tool-input-format.ts:149-201` | `formatToolInput` switch, 20 cases + generic fallback | `read_file, list_file, write_file, edit_file, delete_file, run_command, grep, glob, task, todo, web_search(+websearch), web_fetch(+webfetch), tree, load_skill, ask_user, create_plan(+update_plan), list_skills`. **Missing:** `complete_plan, get_command_output, kill_command, memory_*, lsp_*, ast_search, code_overview, code_rewrite, execute_typescript, discover_tools` | `messages/ToolCallPartView.tsx:100`, `messages/TaskToolInputView.tsx:19` |
| T6 | scattered name checks | inline `toolName ===` | `messages/ToolStatusIcon.tsx:19` (`ask_user`), `messages/ToolOutputView.tsx:42,52,73` (`todo`, `ask_user`, `run_command`), `messages/ToolInputView.tsx:31,38,48,64` (`task`, `write_file`, `edit_file`), `messages/ToolCallPartView.tsx:74,75` (`run_command`, `task`), `utils/tool-timing-store.ts:37` (`CLIENT_TOOL_NAMES = {ask_user}`) | the views themselves |

Purely presentational (must stay in app): `getToolCallColor` (`tool-display.ts:42`), `buildToolHeader` (`:295`), `ToolStatusIcon`, `TodoToolOutputView`, `TaskToolInputView`, `EditFilePreview`, `MessageDiffView`, `StreamingOutputView`, `streaming-output-lines.ts`, theme/chalk usage.

Moveable pure logic: `tool-part.ts` (state mapping), `tool-activity-summary.ts` (all of it), `tool-display.ts` constants + `hasDetailedOutputBlock` / `keepsCompactRow` / `getDurationMs` / `getInlineSummary` / `getCompactOutput`, `tool-output-format.ts` (all of it), the non-chalk branches of `tool-input-format.ts`.

### 1.2 Core-side state

- `define-tool.ts:66` accepts `display?: ToolDisplayMeta`; `:80` calls `registerToUI`, `:84` calls `registerToolDisplay`. Registries: `agent/tools/runtime/to-ui-registry.ts`, `agent/tools/runtime/tool-display-registry.ts`.
- **No built-in tool declares `toUI` or `display`** — every bit of built-in display knowledge is in the app tables above.
- Built-in tool definition sites: `agent/tools/{read-file-tool.ts:112, write-file-tool.ts:14, edit-file-tool.ts:46, delete-file-tool.ts:11, list-file-tool.ts:15, tree-tool.ts:24, glob-tool.ts:116, grep-tool.ts:285, run-command-tool.ts:20, get-command-output-tool.ts:11, kill-command-tool.ts:11, websearch-tool.ts:76, webfetch-tool.ts:94, ask-user-tool.ts:33}`, `agent/todo/todo-tool.ts:13`, `agent/plan/create-plan-tool.ts:48,130`, `agent/subagent/task-tool.ts:101`, plus the extension-backed built-ins (`agent/lsp/*`, `agent/memory/extension.ts`, `agent/skills/extension.ts`, code-mode) and the lazy/discovery tools (`execute_typescript`, `discover_tools`).

### 1.3 Propagation constraints (these drive the design)

1. **TanStack writes the part**: `activities/chat/stream/message-updaters.js:115` `updateToolCallWithOutput` does `parts[index] = { ...toolCallPart, output, state }` — object spread, so **an extra top-level field on the part survives**.
2. **Core has its own eager UI write path**: `managers/middleware/early-tool-result-ui-middleware.ts:27` `channel.addToolResult(toolCallId, info.result ?? null)` on `onAfterToolCall`; `AgentUIChannel.addToolResult` (`agent/ui-channel.ts:214`) → TanStack's `StreamProcessor.addToolResult`.
3. **The model wire ignores unknown fields**: `uiMessagesToModelMessages` copies only `{id, type:"function", function, ...metadata}` for tool calls and `{content, toolCallId, name?, ...}` for results — a UI-only field cannot leak into the prompt.
4. **App part rebuilds mostly spread**: `dedupe-tool-calls.ts:28,47,57`, `get-messages.ts:45,127`, `project-transcript.ts:51`. **Exception**: `dedupe-tool-calls.ts:125` `mergeToolCallPart` rebuilds field-by-field (`state`, `output`, `arguments`, `approval`, `metadata`) — a field present only on the *duplicate* is dropped.
5. **App render caches fingerprint only 4 fields**: `dedupe-tool-calls.ts:207` `encodeToolCallState` and `:238` `encodePartRenderSignature` (id/state/hasOutput/approval) feed `get-messages.ts:54` `computeMessageRenderSignature` (flat cache) and `MessageList.tsx:41-57` (dynamic signature). A display-only change would **not** invalidate them — same failure class as the `73d5d95` flat-cache staleness fix.

## 2. Target design

### 2.1 Core: per-tool presentation descriptors (function-bearing, in-process)

```ts
// packages/core/src/agent/tools/presentation/types.ts
export interface ToolPresentation {
  category?: ToolActivityCategory;                     // fold bucket (reads/edits/…/other)
  keepRow?: boolean;                                   // never fold when completed (structured/interactive)
  detailed?: boolean;                                  // full-mode output block
  clientSide?: boolean;                                // the host supplies the result (ask_user)
  summary?: (output: unknown) => string | undefined;    // header text, e.g. "3 matches"
  label?: (input: unknown) => string | undefined;       // activity-line label
  text?: (output: unknown) => string | undefined;       // result block text (today's toUI)
  input?: (input: unknown, opts: { compact: boolean }) => string | undefined;
}
```

- Declared where the tool lives: `defineServerTool({ present: { ... } })` for built-ins (each of the ~30 sites declares **its own** metadata, deleting the central tables), or `registerToolPresentation(name, present)` for tools registered at runtime.
- **One property only.** `present` replaces today's two extension-facing fields (`toUI`, `display`); the old names are **removed without aliases** (breaking for extensions — `examples/extensions/*` and the extension README are updated in the same change). `to-ui-registry.ts` and `tool-display-registry.ts` are deleted; their contents fold into the presentation registry.
- Resolution order: runtime registration (extension/custom) → per-tool declaration → core's built-in fallback table. The fallback table exists only so third-party/custom tools sharing a built-in name behave sensibly; it is no longer duplicated in the app.

### 2.2 Core: serializable catalog for hosts (cross-process)

```ts
export interface ToolPresentationInfo {
  name: string;
  category?: ToolActivityCategory;
  keepRow?: boolean;
  detailed?: boolean;
  clientSide?: boolean;
  hasText?: boolean;     // a result renderer exists
  hasSummary?: boolean;
  labelKey?: string;     // declarative label source (input field name) for hosts that cannot call functions
}
```

- Published as `snapshot.toolDescriptors: ToolPresentationInfo[]` (built-ins + extension-registered, merged), plus per-tool attribution in the existing `ExtensionInfo.tools` entries.
- Reaches every host through the existing channel: `AgentSessionSnapshot` (`agent-session/types.ts:82` today carries `extensions: ExtensionInfo[]`), the retained `session:extensions` event (`managed-agent.ts:709`), the server snapshot route, and `remote-session-client.ts` (`emptySnapshot` + `applyEvent` must carry the new field — that client rebuilds snapshot fields explicitly).
- Used by hosts for: row/block treatment before any payload exists (executing tools), engine decisions that must match core's fold rules (which tools may fold, which never do), and `labelKey` as a cross-process label fallback.

### 2.3 Core: per-call display payload on the part

Data flow — three hops, no second channel, no async round-trip:

1. **At completion, in core.** The tool's result lands in the part's `output` (written by TanStack, constraint 1); `early-tool-result-ui-middleware.onAfterToolCall` renders the descriptor's pure functions (`text` / `summary` / `label`) over that result.
2. **Onto the same message part.** `AgentUIChannel.attachToolDisplay(toolCallId, payload)` patches that tool-call part via the processor's `getMessages`/`setMessages` (`ui-channel.ts:210`).

```jsonc
// UIMessage.parts[i]
{
  "type": "tool-call",
  "id": "call_abc",
  "name": "grep",
  "arguments": "{\"pattern\":\"compact\"}",
  "state": "complete",
  "output": { "matches": [/* … */] },                      // the tool's own data (model side owned by toModelOutput)
  "display": { "text": "…", "summary": "3 matches", "label": "\"compact\"" }  // core-written, host-read
}
```

3. **To the host, with the message.** The part travels unchanged through the session snapshot, `.session.jsonl`, and (off-process) the server transport; hosts read `part.display` directly. Core exports `ToolDisplayPayload` plus a `DisplayToolCallPart = ToolCallPart & { display?: ToolDisplayPayload }` type so hosts need no bespoke accessor.

- **Carrier decision**: top-level `part.display`, **not** `output.display`. Putting it inside the tool output would change the model wire for every tool without a `toModelOutput` transform (the model receives the raw output object — today's `durationMs` leak is the same pattern), and an extension's own `toModelOutput` could forward it wholesale. `output` is the tool's data contract (`outputSchema`, diffs, `success`); `display` is host-facing presentation.
- **`text` semantics**: `present.text` means "this rendered line *is* the row" — today's extension `toUI`. Built-in fallback descriptors therefore do **not** set it: `read_file` and friends fold into `1 read` today and must keep folding. A built-in's full-mode result block still comes from the ported formatter switch, and stage 3 uses that as the payload text whenever `present.text` is absent (so `keepsCompactRow` keeps exactly today's meaning: `keepRow || clientSide || text`).
- Computed **once, at completion**, from the stored output by the descriptor's pure functions → deterministic (no timestamps, no randomness).
- Placement: top-level `display` (not `metadata` — TanStack reserves `metadata` for model-facing payloads and `uiMessagesToModelMessages` forwards it).
- Not written to the model wire (constraint 3); `toModelOutput` keeps owning model text.
- Persisted inside `.session.jsonl` as part of the durable chain; restore reads the stored value as-is. **No history migration and no backfill** (accepted): parts written before this change simply have no `display`, hosts render them from the catalog, and an old extension that still passes `toUI`/`display` gets nothing (breaking change accepted).
- Compact clamping (one line / 200 chars) stays a **host** concern; the payload carries full text.

### 2.4 App: what remains

- ink components and theme (`messages/*`, `COLORS`, `chalk`), diff/preview views, `streaming-output-lines` window helpers.
- `project-transcript.ts` keeps its projection loop (it synthesizes the `display-activity:*` rows) but consumes core's fold decision and precomputed labels instead of local tables.
- Reads: `part.display.*` first, then the catalog; in-process it may still call core formatters as a fallback (same source of truth, no drift).

### 2.5 Cache invalidation (required, not optional)

- `encodeToolCallState` (`dedupe-tool-calls.ts:207`) and `encodePartRenderSignature` (`:238`) gain a digest of `part.display` (reuse `packages/app/src/utils/string-digest.ts`).
- `computeMessageRenderSignature` (`get-messages.ts:54`) inherits it through the part signature.
- `MessageList`'s dynamic signature (`:41-57`) must include the same digest.
- `mergeToolCallPart` (`dedupe-tool-calls.ts:125`) carries `display: primary?.display ?? duplicate?.display`.

## 3. Migration mapping

| app today | destination | notes |
|---|---|---|
| T1 `TOOL_BUCKET` + `BUCKET_LABEL` + fold/summary/label helpers (`tool-activity-summary.ts`) | core `tools/presentation/activity-summary.ts` | buckets come from descriptors; the fold decision (`shouldKeepToolRow`) reads `keepRow`/`clientSide` |
| T2 keep-row / detailed sets | descriptor flags `keepRow` / `detailed`, declared per tool | deletes the contradiction between the two sets |
| T3 `getInlineSummary` | `descriptor.summary(output)` + precomputed `part.display.summary` | one implementation, used both in-process and cross-process |
| T4 `formatToolOutput` (+ `getToUI`) | `descriptor.text(output)` + `part.display.text` | fixes extension output blocks in remote `full` mode |
| T5 `formatToolInput` | `descriptor.input(input, {compact})` returning **plain text** | app keeps only the ANSI styling of the `run_command` `$` prefix |
| T6 scattered `toolName ===` checks in views | `descriptor.*` flags (`clientSide`, plus view-specific descriptors like `diffInput: true`) | `CLIENT_TOOL_NAMES` becomes `descriptor.clientSide` |
| `tool-part.ts` (`getUiToolState` etc.) | core (pure state mapping), re-exported to app | no behavior change |
| `getToolCallColor`, `buildToolHeader`, `ToolStatusIcon`, diff views, `streaming-output-lines` | **stay in app** | chalk/ink/theme/version-layout |

## 4. Risks & mitigations

1. **Stale render caches** (display changes but signatures do not) → §2.5, covered by tests that mutate only `display` and assert the projected/derived row changes.
2. **Dropped field on dedupe merge** → explicit `display` merge in `mergeToolCallPart`; regression test with a duplicate-only payload.
3. **No compatibility promises (decided)** → `present` is the only surface (old `toUI`/`display` removed), no history backfill, no snapshot-version shim. The payload stays optional so hosts never crash on parts written earlier; `remote-session-client.emptySnapshot` / `applyEvent` are updated in the same change so a fresh remote host always has the field.
4. **Prompt cache / wire leakage** → payload never forwarded by `uiMessagesToModelMessages`; descriptor functions must be pure functions of the stored output (documented in the descriptor type).
5. **Persistence growth** → payload is a short string per tool call, derived data; acceptable (same order as existing `output`).
6. **Boundary churn** → `validate:core-imports` allowlist + `packages/app/README.md` boundary section + `AGENTS.md` updated in the same change; `validate:presentation-helpers` is unaffected (it only checks compaction-summary markers).
7. **Big-bang risk across ~30 tool sites** → staged: descriptor infra + fallback table first (no app change, no behavior change), then built-ins migrate one group at a time, then the app tables are deleted last.
8. **Remote `label`** → functions cannot cross the wire; `labelKey` covers declarative labels, and `part.display.label` (precomputed) covers everything else.

## 5. Alternatives considered

- **Keep the app tables, only ship extension metadata over the snapshot (option 1 alone)** — cheapest, but leaves four duplicated built-in tables and their drift; rejected as the end state (still useful as the intermediate step in staging).
- **Render on demand over `session.dispatch`** (host asks core to render a row, cached per `toolCallId`) — no part/schema change, works with function renderers, but makes the render path async in a per-frame TUI and adds chatty round-trips; rejected.
- **Carry the payload inside the tool output (`output.display`)** — avoids a new part field and any type helper, but leaks into the model wire for tools without a `toModelOutput` transform, pollutes the tool's own data contract, and can be forwarded wholesale by an extension's transform; rejected in favour of the part-level `display` (see §2.3).
- **Move the React/ink views into core** — core would need ink/theme/chalk and would stop being runtime-agnostic (playground/server import it); rejected.
- **Ship extension code to hosts so they can call `toUI` themselves** — extensions need CoreEnv/child-process access; architecturally impossible.

## 6. Decisions (settled 2026-09-14)

1. **One property, no aliases**: `present` replaces `toUI` + `display`; extension-facing breaking change, demos/docs updated in the same change.
2. **Carrier**: top-level `part.display = { text?, summary?, label? }`; core exports `ToolDisplayPayload` / `DisplayToolCallPart` types; hosts read `part.display` directly (no accessor function).
3. **No history**: no snapshot shim, no backfill, no recompute on restore — old parts render from the catalog.
4. **`labelKey`**: keep the field (declarative label source for cross-process hosts), unused by built-ins.
5. **Wording** (`BUCKET_LABEL` / activity-summary text) lives in core, since core produces the string; the host only styles it.
6. **`streaming-output-lines.ts` stays in app**: core formatters return unsplit text.
7. **`@my-agent/app` keeps its public exports**: the formatter symbols become thin re-exports of core (no breaking change for app consumers), while the app-side tables and switch bodies are deleted.
