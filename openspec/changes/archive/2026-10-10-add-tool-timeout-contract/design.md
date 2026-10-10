## Context

The tool layer already knows how to distinguish a timeout from a user cancel: the run signal
is the only source of the cancel verdict, and a timeout is expressed as an abort **reason**
(`ExecutionError("timeout", …)`) rather than a bare `abort()`
(`agent/tools/websearch/abort-timeout.ts`, `runtime-types/abort.ts`, and the
`run-abort-ownership` spec). The missing piece is a single declaration surface so every
blocking tool gets that behaviour instead of re-deriving it.

Tools reach execution through two registration paths:

- Built-ins: `defineServerTool(...)` (`agent/tools/runtime/define-tool.ts`), whose
  `ToolExecuteCtx` currently carries only `toolCallId`, `abortSignal`, `agentId` — no deadline.
- Extension tools: registered in `managers/services/extension-registry-service.ts`, which
  already reads `ExtensionToolDefinition.timeoutMs` but wraps it in a local `withTimeout`
  that rejects with a plain `Error`.

## Goals / Non-Goals

- Goals:
  - One place to declare a deadline, one implementation that enforces it.
  - A timeout is always a typed failure; a run abort always wins and stays a cancel.
  - No behaviour change for tools that do not declare a deadline.
- Non-Goals:
  - A global default deadline (opt-in only).
  - MCP tools (bypass `defineServerTool`) and client tools (no server execute).
  - Retry/backoff on timeout (only the verdict and the error contract).

## Decisions

- Decision: extend `defineServerTool` config with an optional `timeoutMs`; the runtime applies
  the wrapper only when it is present. This keeps every existing tool byte-identical.
  - Alternative: a central registry of per-tool timeouts. Rejected — a declaration belongs with
    the tool, and a registry splits the deadline from the code it governs.
- Decision: move `createTimeoutAbort` from `agent/tools/websearch/abort-timeout.ts` to a shared
  `agent/tools/util/` (or `runtime/`) location and reuse it verbatim. It already implements the
  required semantics (external run-signal link → cancel; timer → `ExecutionError("timeout")`).
  - Alternative: a new helper. Rejected — the semantics and the "timeout is not a cancel" test
    already exist and were hardened by `validate:websearch-providers` + `validate:cancel-semantics`.
- Decision: the wrapper checks the run signal **before** the deadline verdict, so a simultaneous
  stop + expiry reads as cancelled. This mirrors the existing `isAbortError` ordering.
- Decision: extension tools delegate to the same wrapper, replacing the plain-`Error`
  `withTimeout`, so both paths share one error shape.

## Risks / Trade-offs

- [Signal composition bug reintroduces a false cancel] → the moved helper is covered by the
  existing timeout-vs-cancel assertions; add a dedicated `validate:tool-timeout-contract`.
- [A declared deadline is too short for a legitimately slow tool] → deadlines are per-tool and
  opt-in; the default is "no deadline" so nothing changes until a tool declares one.
- [Import churn from moving the helper] → the move is mechanical; websearch providers re-import
  from the new path and the existing websearch validator still runs.

## Migration Plan

1. Move `createTimeoutAbort` and update its importers.
2. Add `timeoutMs` to `defineServerTool` and apply the wrapper in the server execute wrapper.
3. Route extension-tool timeouts through the shared wrapper.
4. Add the validator; run the full core suite.

Rollback is removing the `timeoutMs` config usage; the helper move is inert on its own.

## Open Questions

- Should a small set of built-ins (e.g. websearch, webfetch) migrate to the declared
  `timeoutMs` in this change, or keep their hand-rolled wiring until a follow-up? (Leaning:
  keep them as-is in this change to keep the diff focused, and migrate in a follow-up.)
- Should the extension `timeoutMs` default change from "none" to a sane default? (Leaning: no —
  preserve current behaviour.)
