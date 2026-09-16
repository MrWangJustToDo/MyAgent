# Design: Token-budget compaction with split-turn support

## Context

Compaction never deletes messages. A successful compact appends a `[CONVERSATION SUMMARY]` checkpoint to the chronological UI channel; the LLM wire is derived at read time by `getModelVisibleMessages()` (`message-chain-projection.ts`), which finds the latest summary and re-runs `findCutPoint()` over the frozen pre-summary slice. The `cutIndex` computed at compact time is not consumed by recovery — recovery relies on the cut function being deterministic over immutable input.

Today that function counts real user turns (`keepRecentFlows = 2`). With small context windows, one turn can fill the window; then no valid cut point exists, `autoCompact` returns `compacted: false`, and reactive compaction (fixed 5-message tail) cannot rescue the session.

Reference implementations studied:
- **pi** (`tmp/earendil-works-pi/packages/coding-agent/src/core/compaction/compaction.ts`): token-budget keep (`keepRecentTokens`), valid cut points at user/assistant boundaries only (never tool results), `isSplitTurn` with a dedicated turn-prefix summarization prompt merged into the main summary.
- **opencode** (`tmp/sst-opencode/packages/opencode/src/session/compaction.ts`): `preserve_recent_tokens = clamp(usable * 0.25)`, `splitTurn()` intra-turn probing, prune layer for old tool outputs.

## Goals / Non-Goals

- Goals:
  - Compaction can always shrink context, even when a single turn fills the window.
  - Tool call/result pairing is never broken on the wire.
  - Wire projection stays deterministic and prefix-cache friendly between compactions.
- Non-Goals:
  - No proactive prune/micro-compact of historical tool outputs (mutates history → cache busts + projection drift). Deferred.
  - No changes to SUMMARY markers, session persistence format, or channel layout.

## Decisions

### D1 — Keep policy: `keepRecentTokens` budget, derived from model window

- Add `keepRecentTokens?: number` and `reserveTokens?: number` to `CompactionConfig` (`types.ts`). Defaults resolved via a helper: when the agent's `ModelInfo` provides a context window, `keepRecentTokens = min(window * KEEP_RATIO, KEEP_CAP)` (start with ratio 0.25, cap 32k — same shape as opencode); `reserveTokens` defaults to ~16k (pi's value).
- When no context window is known, fall back to legacy count-based behavior (`keepRecentFlows`) so exotic/local models degrade gracefully instead of mis-cutting.
- Rationale: fixed turn count is the root bug; a budget scales automatically across 32k–1M windows.

### D2 — Pairing-safe budget walk in `findCutPoint`

- Walk backward accumulating `estimateTokens(message)` until the budget is reached; cut at that boundary.
- Valid cut points exclude:
  - `role: "tool"` messages (a tool result must stay adjacent to its tool call; cutting at any non-tool index keeps all later results paired);
  - in-chain compaction summaries and explicit summary index (existing rules kept);
  - synthetic `<turn_context>` messages (existing rule kept).
- Deterministic pure function over frozen input — unchanged contract from today.

### D3 — Split-turn handling with turn-prefix summary

- If the chosen cut point is not a user message, mark `isSplitTurn` and record the enclosing turn's start index (backward scan for the real user message).
- Summarizer receives three labeled segments (extends existing `<to_compress>` / `<still_in_context>` scheme):
  - `<to_compress>` — pre-history before the split turn;
  - `<turn_prefix>` — discarded head of the split turn;
  - `<still_in_context>` — kept suffix (alignment only).
- Turn-prefix summary uses a dedicated prompt section (original request / early progress / context needed by the kept suffix, modeled on pi's `TURN_PREFIX_SUMMARIZATION_PROMPT`) and is merged into the final SUMMARY text.
- Oversized slices are already handled by `splitMessagesByTokenBudget` batching — reuse as-is.

### D4 — Trigger becomes window-relative

- `shouldTriggerAutoCompact`: when usage tokens and model context window are available, trigger at `(window - reserveTokens) * compactAtPercent/100`; absolute `tokenThreshold` remains the fallback path. Real usage tokens are preferred over estimation (already plumbed as `windowInputTokens`).

### D5 — Reactive tail by budget

- Replace `DEFAULT_REACTIVE_KEEP_TAIL = 5` message-count keeping with the same budget walk + pairing rules (D2), so emergency compaction also works when one message is huge and never splits pairs.

### D6 — Config threading (mechanical)

- `GetModelVisibleMessagesOptions` gains a keep-policy parameter (budget or legacy count). All four call sites read it from agent compaction config: `managed-agent.ts` (`getMessagesForLLM`), `managed-agent-compact.ts`, `middleware/compaction-middleware.ts` (`projectWireFromChannel`), `apply-compaction-result.ts` (orphan-cache cleanup). Compact time and projection time therefore always agree.

## Risks / Trade-offs

- **Estimation error** (chars/4 heuristic) may cut slightly off target → mitigated by `reserveTokens` headroom and preferring real usage tokens at the trigger.
- **Kept-window shift after future content changes**: only relevant if prune is added later; if so, estimates must use append-time original sizes. Not applicable now (history is immutable).
- **Behavior change for existing sessions**: sessions configured with explicit `tokenThreshold` keep working; `keepRecentFlows` remains honored when no model window is available (legacy path).
- **Prefix cache**: wire still changes only at compaction moments (additive SUMMARY + re-projection), same as today; no mid-history mutation.

## Migration Plan

1. Land config + cut-point refactor with legacy fallback (no behavior change without a known model window).
2. Enable budget path where `ModelInfo.window` exists; update validate scripts.
3. Rollback = revert config resolution to legacy path (single helper).

## Open Questions

- Exact `KEEP_RATIO` / `KEEP_CAP` values — tune during implementation against 32k and 128k reference models.
