## 1. Shared timeout helper

- [x] 1.1 Move `createTimeoutAbort` from `packages/core/src/agent/tools/websearch/abort-timeout.ts` to `packages/core/src/agent/tools/util/abort-timeout.ts`
- [x] 1.2 Update `agent/tools/websearch` importers (`providers/brave.ts`, `providers/exa.ts`, `providers/duckduckgo.ts`, `index.ts`) to the new path
- [x] 1.3 Re-export `createTimeoutAbort` from the dev/barrel entries so existing validators keep importing it

## 2. Declared deadline on `defineServerTool`

- [x] 2.1 Add optional `timeoutMs` to the `defineServerTool` config and `ToolExecuteCtx`
- [x] 2.2 Apply the shared wrapper in the server execute wrapper only when `timeoutMs` is set; leave the run signal as the cancel verdict
- [x] 2.3 Confirm a simultaneous stop + expiry reads as cancelled (signal checked before deadline)

## 3. Extension tools share the wrapper

- [x] 3.1 Replace the local `withTimeout` in `managers/services/extension-registry-service.ts` with the shared helper
- [x] 3.2 Ensure extension-tool timeouts reject with `ExecutionError("timeout", …)` instead of a plain `Error`

## 4. Coverage

- [x] 4.1 Add `packages/core/scripts/validate-tool-timeout-contract.mjs`
- [x] 4.2 Assert: a `defineServerTool` tool with `timeoutMs` fails (not cancelled) on expiry while the run signal is live
- [x] 4.3 Assert: an extension tool with `timeoutMs` rejects with `ExecutionError("timeout")`
- [x] 4.4 Assert: a run abort during a declared-deadline tool still settles as cancelled
- [x] 4.5 Register `validate:tool-timeout-contract` in `packages/core/package.json`
- [x] 4.6 Run the full core validator suite and typecheck/lint
