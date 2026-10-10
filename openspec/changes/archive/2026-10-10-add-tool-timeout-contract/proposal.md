## Why

Tools that can block on a remote call or a subprocess guard against a never-returning
invocation today through ad-hoc, per-tool timeouts and there is no single place that
declares a deadline:

- `websearch` (`agent/tools/websearch/abort-timeout.ts`) and `webfetch` build their own
  timeout controllers.
- `run_command` forwards a `timeout` to `CoreEnv`.
- Extension tools declare `ExtensionToolDefinition.timeoutMs`, but their local
  `withTimeout` rejects with a plain `Error` (`managers/services/extension-registry-service.ts:38-54`),
  which is not typed as a timeout.

Because the verdict for "timeout vs user cancel" lives in `run-abort-ownership`
(`specs/run-abort-ownership/spec.md`: *A local timeout is not a user cancellation*), a
timeout is only correctly classified for the tools that happen to hand-roll the
`ExecutionError("timeout", …)` convention. A newly added blocking tool can silently hang,
or worse, be reported to the model as a user cancellation the user never issued.

## What Changes

- Add an optional `timeoutMs` to the `defineServerTool` config (`agent/tools/runtime/define-tool.ts`).
  When set, the tool runtime enforces the deadline.
- Promote the existing `createTimeoutAbort` helper out of `agent/tools/websearch/` into the
  shared tool runtime/util layer and make `defineServerTool` apply it whenever `timeoutMs` is
  declared. The helper aborts with `ExecutionError("timeout", …)` and composes with the run signal.
- Route the extension-tool timeout through the same helper so it rejects with a typed
  `ExecutionError("timeout")` instead of a plain `Error`.
- Preserve `run-abort-ownership` unchanged: a timeout while the run signal is live settles as a
  failure (never `cancelled: true`); a run abort still settles as cancelled.
- Add `validate:tool-timeout-contract` covering the timeout-vs-cancel matrix for a
  `defineServerTool` tool and an extension tool.

## Capabilities

### New Capabilities

- `tool-timeout-contract`: a declinable per-tool execution deadline enforced by one shared
  wrapper that produces a typed timeout failure, with the run signal taking precedence.

## Impact

- Affected specs: `tool-timeout-contract` (new); builds on `run-abort-ownership` (unchanged).
- Affected code:
  - `packages/core/src/agent/tools/runtime/define-tool.ts` — accept and enforce `timeoutMs`
  - `packages/core/src/agent/tools/util/abort-timeout.ts` — moved from `websearch/`; shared
  - `packages/core/src/agent/tools/websearch/*` — re-import the moved helper
  - `packages/core/src/managers/services/extension-registry-service.ts` — reuse the shared wrapper
  - `packages/core/scripts/validate-tool-timeout-contract.mjs` (new)
- Non-goals: MCP tools (they bypass `defineServerTool`) and client tools (no server execute)
  are out of scope; this change does not add a global default deadline, so long-running tools
  such as `run_command` keep their current opt-in behaviour.
