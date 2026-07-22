# Demo extensions

Sample modules for manual testing. **Not** loaded by default — core only scans `.agents/extension` and `~/.agents/extension`.

| File | What it demos | How to try |
|------|----------------|------------|
| `demo-ping.mjs` | Slash command + toast | `/ping` / `/ping hello` |
| `demo-echo-tool.mjs` | Custom tool `ext_echo` | Ask the agent to call `ext_echo` |
| `demo-guard.mjs` | `tool:before:run_command` deny | Ask agent to run `rm -rf /` |
| `demo-status.mjs` | Footer status + confirm | `/ext-status on`, `/ext-confirm` |

Load demos explicitly:

```bash
# env
AGENT_EXTENSION_DIRS=examples/extensions pnpm start:cli

# or CLI flag (comma-separated)
pnpm start:cli -- --extension-dirs examples/extensions
```

Project `.agents/extension` and `~/.agents/extension` still load automatically; same id later wins.

Export shape: `ExtensionAPI` object, `ExtensionFactory` (`{ create() }`), or `activate(ctx)` function (see `normalizeExtensionExport`).

For tool schemas, use **`ctx.z`** (host Zod). Do not `import` zod — filesystem extensions may not resolve workspace dependencies.
