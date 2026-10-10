# Change: Harden code-mode binding names against invalid identifiers

## Why

`@tanstack/ai-code-mode` derives each sandbox binding name as `` `${prefix}${tool.name}` `` with **no character normalisation** — concatenated in `dist/esm/bindings/tool-to-binding.js:12` (`toolsToBindings`, the map key) and `:50` (`toolToBinding`, the binding's `name`), and passed verbatim to `driver.createContext({ bindings })` (`create-code-mode-tool.js:130`). For a tool named with a hyphen the generated stub is not a legal JS/TS identifier, and the sandbox global it declares is unreachable:

```typescript
declare function external_mcp__myserver_read-file(input: …): Promise<unknown>
//                              ^^^^^^^^^^^^^^^^^^^^^^^ parses as subtraction
```

Measured on our tree: passing `mcp__myserver_read-file` and `mcp__myserver_read_file` to `createCodeMode()` emits both stubs verbatim, and the first is unusable. This is the same class of bug upstream `earendil-works/pi` fixed in v0.99.2 — two tool names differing only in `-`/`_` made a script call the wrong tool, silently.

Two things make it worth fixing before it is reachable:

1. **It is currently latent, not absent.** `agent-factory.ts:343-345` curates a hard-coded tool list (`read_file/grep/glob/list_file/tree` eager, `run_command/websearch` lazy) that contains no MCP tools. The moment MCP tools are offered to code mode (the obvious next step — they are already the reason `discover_tools` exists), every hyphenated MCP tool name breaks: an invalid stub in the prompt and a script that cannot call it.
2. **Our existing duplicate guard cannot catch it.** `ai-mcp`'s `DuplicateToolNameError` compares exact strings after prefixing, so `read-file` and `read_file` pass it as distinct — and after normalisation they would collide with no diagnostic.

## What Changes

- Add a normalisation step in `code-mode/extension.ts` (at the point tools are mapped to `CodeModeTool`, `extension.ts:184`) that rewrites each binding name to a legal identifier: `-` → `_`, and any other character outside `[A-Za-z0-9_]` → `_`.
- Detect collisions **after** normalisation and disambiguate each colliding tool with a suffix derived from its own name, so two tools that differ only in `-`/`_` remain individually callable and the assignment does not depend on the order the tools arrived in (MCP tools are collected as servers connect).
- Keep the model-facing tool name and the sandbox binding name linked: the name the model sees in `discover_tools` must match the identifier a script can call. Where a rename happens, the renamed tool object is what reaches `createCodeMode`, so every surface that derives from it uses the normalised name.
- Handle the unresolvable case: when the *same* tool name is offered twice it cannot be separated from itself, so code mode SHALL drop the duplicate with a warning rather than emit a prompt that cannot work.
- **No behaviour change** for the current curated list (all names already legal), asserted by a validator.

## Impact

- Affected specs: `code-mode-tool-bindings` (new capability)
- Affected code: `packages/core/src/agent/code-mode/extension.ts` (normalisation + collision handling at the tool-mapping site); possibly a small helper module under the same directory
- Upstream: no change is expected in `@tanstack/ai-code-mode`. Checked in the installed artifact — `@tanstack/ai-code-mode@0.4.21` `dist/esm/bindings/tool-to-binding.js` still builds the binding name as `` `${prefix}${tool.name}` `` with no normalisation, in both `toolsToBindings` (`:12`) and `toolToBinding` (`:50`). We normalise on our side rather than waiting, consistent with the repo's existing precedent for upstream gaps we cannot absorb (see `packages/codent/README.md` on `isolated-vm` prebuilds). If upstream later normalises too, our step becomes a no-op — the helper is idempotent (task 1.2) and the validator still passes.
- Validation: `validate:code-mode-binding-names` — legal-identifier output, `-`/`_` collision disambiguation, current curated list unchanged, unresolvable collision warns and drops
