## 1. Normalisation helper

- [x] 1.1 Add a `normalizeBindingName(name)` helper in `packages/core/src/agent/code-mode/` (`-` → `_`, `[^A-Za-z0-9_]` → `_`, prefix guard for a leading digit)
- [x] 1.2 Keep it pure and idempotent; document why it exists (upstream concatenates `` `${prefix}${tool.name}` `` verbatim at `tool-to-binding.js:12`/`:50`, and `create-code-mode-tool.js:130` passes it to `driver.createContext` as a sandbox global)
- [x] 1.3 Unit-cover idempotence and the leading-digit case in the validator, not just happy paths

## 2. Collision handling

- [x] 2.1 Build the renamed tool list at `code-mode/extension.ts:184` (the `codeModeTools` mapping), before `createCodeMode`
- [x] 2.2 Detect post-normalisation duplicates and assign a deterministic short suffix (stable across runs for the same input set)
- [x] 2.3 When no distinct name is possible, drop the colliding tool with a warning naming both original names
- [x] 2.4 The renamed tool objects flow into `discover_tools` and the system prompt via `createCodeMode`, so the `name`/`description` those surfaces present are already the normalised ones (upstream adds the `external_` prefix itself; `toExtensionTool`'s `name: tool.name` is the upstream tool name, `execute_typescript`/`discover_tools`)

## 3. Discoverability consistency

- [x] 3.1 Confirm `discover_tools` output names normalised bindings (probe with a lazy hyphenated tool)
- [x] 3.2 Confirm the Available External APIs list and the Type Definitions stubs agree on the same name
- [x] 3.3 Assert no prompt section contains a pre-normalisation name as a binding

> Note: 3.1–3.3 hold by construction — every surface derives from the tool object's `name`, so one normalisation upstream of all three covers them. The validator asserts each surface, not just the shared mechanism.

## 4. Validation

- [x] 4.1 `validate:code-mode-binding-names` — legal-identifier output for hyphen/dot/space/colon names
- [x] 4.2 Assert the current curated list (`read_file/grep/glob/list_file/tree/run_command/websearch`) produces a byte-identical prompt to the pre-change output
- [x] 4.3 Assert `read-file` + `read_file` both remain callable with distinct names
- [x] 4.4 Assert an unresolvable collision drops the offender with a warning (and that the run still succeeds)
- [x] 4.5 Wire the validator into `packages/core/package.json` scripts and confirm it fails when the normalisation step is reverted

## 5. Forward-compatibility note

- [x] 5.1 Document that if upstream begins normalising, this step becomes a no-op (task 1.2 idempotence) and the validator still passes; note also that the collision suffix is order-independent, so a script survives a change in MCP server connection order
- [x] 5.2 Leave a pointer in the code-mode module comment to the upstream fix (pi v0.99.2) as the reason this guard exists
