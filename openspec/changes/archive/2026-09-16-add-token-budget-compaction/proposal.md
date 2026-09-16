# Change: Token-budget compaction with split-turn support

## Why

Auto-compaction currently decides the kept window by counting real user turns (`keepRecentFlows = 2`, `findCutPoint` in `packages/core/src/agent/compaction/cut-point.ts`). For small-context-window models, a single agentic turn (one user message + many assistant/tool messages) can fill the entire context. In that state no valid cut point exists, `autoCompact` bails out (`compacted: false`), and the reactive fallback keeps a fixed 5 messages that can still overflow and may break tool pairing. The session becomes stuck: too large to send, impossible to compact.

Industry implementations (pi `earendil-works-pi`, opencode `sst-opencode`) solve this with a token-budget keep policy plus intra-turn cutting; we adopt the same approach fitted to our summary-first wire projection.

## What Changes

- **Keep policy: count → token budget.** Add `keepRecentTokens` to `CompactionConfig`. When unset, derive it from the model's context window (models.dev `ModelInfo`) as a fraction with a cap; fall back to legacy `keepRecentFlows` behavior only when no context window is known.
- **Pairing-safe cut points.** `findCutPoint` walks backward accumulating estimated tokens instead of counting user turns. Valid cut points exclude `role: "tool"` messages (never orphan a tool result from its tool call), in-chain summaries, and synthetic `<turn_context>` messages.
- **Split-turn compaction + turn-prefix summary.** When the token budget cut lands inside a turn (cut point is not the turn's user message), summarize the discarded turn prefix with a dedicated prompt (original request / early progress / context needed by the kept suffix) and merge it into the main summary before appending the SUMMARY checkpoint.
- **Window-relative trigger.** Auto-compact trigger uses real usage tokens (`windowInputTokens`) against `contextWindow - reserveTokens` when the model window is known, instead of the absolute default `tokenThreshold = 100k`.
- **Reactive compact budget fix.** Reactive compaction keeps its tail by token budget with pairing-safe boundaries instead of a fixed message count (`DEFAULT_REACTIVE_KEEP_TAIL = 5`).
- **Projection consistency.** Compact-time and wire-projection-time share the same deterministic cut function and config so recovery over the frozen pre-summary slice stays stable.

Out of scope (deliberately deferred): proactive prune/micro-compact of old tool outputs — it mutates history content, breaks prefix-cache stability, and is largely unnecessary once split-turn compaction works. Revisit as a conditional fallback only if real sessions still fail to shrink after this change.

## Impact

- Affected specs: new capability `context-compaction` (no existing spec covers compaction behavior).
- Affected code:
  - `packages/core/src/agent/compaction/types.ts` — config schema
  - `packages/core/src/agent/compaction/cut-point.ts` — budget-based cut point
  - `packages/core/src/agent/compaction/auto-compact.ts` — split-turn summarization, trigger resolution
  - `packages/core/src/agent/compaction/message-chain-projection.ts` — projection options
  - `packages/core/src/agent/compaction/reactive-compact.ts` — tail budget
  - `packages/core/src/agent/compaction/apply-compaction-result.ts` — option threading
  - `packages/core/src/managers/managed-agent.ts`, `managed-agent-compact.ts`, `middleware/compaction-middleware.ts` — config threading
- No persistence-format changes: SUMMARY checkpoint protocol and chronological channel layout are unchanged.
