# Demo extensions

Sample modules loaded from `examples/extensions` (see `getDefaultExtensionDirs()`).

| File | What it demos | How to try |
|------|----------------|------------|
| `demo-ping.mjs` | Slash command + toast | `/ping` or `/ping hello` |
| `demo-echo-tool.mjs` | Custom tool `ext_echo` | Ask the agent to call `ext_echo` |
| `demo-guard.mjs` | `tool:before:run_command` deny | Ask agent to run `rm -rf /` |
| `demo-status.mjs` | Footer status + confirm | `/ext-status on`, `/ext-confirm` |

Project `.agents/extension` and `~/.agents/extension` override the same id. Extra dirs: `AGENT_EXTENSION_DIRS`.

Export shape: `ExtensionAPI` object, `ExtensionFactory` (`{ create() }`), or `activate(ctx)` function (see `normalizeExtensionExport`).

For tool schemas, use **`ctx.z`** (host Zod). Do not `import` zod — filesystem extensions may not resolve workspace dependencies.
