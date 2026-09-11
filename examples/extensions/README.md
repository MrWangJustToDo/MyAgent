# Demo extensions

Sample modules for manual testing. **Not** loaded by default — core only scans `.agents/extension` and `~/.agents/extension`.

| File | What it demos | How to try |
|------|----------------|------------|
| `demo-ping.mjs` | Slash command + toast | `/ping` / `/ping hello` |
| `demo-echo-tool.mjs` | Custom tool `ext_echo` | Ask the agent to call `ext_echo` |
| `demo-guard.mjs` | `tool:before:run_command` deny | Ask agent to run `rm -rf /` |
| `demo-status.mjs` | Footer render surface (raw text + layout tree) + notification | `/ext-badge on`, `/ext-tree`, `/ext-notify` |
| `demo-turn-context.mjs` | Per-turn `before_agent_start` + turn-context provider | `/ext-turn on`, then chat; `/ext-turn tab example.com` |
| `demo-pi-like.mjs` | pi-like capabilities: `session:start`/`session:shutdown`, render surface, plain JSON Schema tool, `modifiedResult`, CoreEnv access | Ask the agent to use `ext_json_echo` or `ext_echo`; `/ext-root` |

Load demos explicitly:

```bash
# env
AGENT_EXTENSION_DIRS=examples/extensions pnpm start:cli

# or CLI flag (comma-separated)
pnpm start:cli -- --extension-dirs examples/extensions
```

Project `.agents/extension` and `~/.agents/extension` still load automatically; same id later wins.

Export shape: `ExtensionAPI` object, `ExtensionFactory` (`{ create() }`), or `activate(ctx)` function (see `normalizeExtensionExport`).

Manage loaded extensions at runtime with `/extensions` (list), `/extensions enable <id>`, and `/extensions disable <id>` (disabling deactivates the extension and unregisters its tools, commands, interceptors, and turn-context providers).

For tool schemas, use **`ctx.z`** (host Zod) as the convenience API. `inputSchema`/`outputSchema` are also widened to accept any Standard-Schema / JSON-Schema-compliant schema (Zod, ArkType, Valibot, or a plain JSON Schema object) — see `demo-pi-like.mjs`.

Extensions can now also:
- Observe the agent session lifecycle via `session:start` / `session:shutdown` interceptors.
- Draw into the host UI via the single generic surface: `ctx.ui.render(surface, key, payload)` with `payload` = raw text (ANSI + newlines preserved) or a `text` / `row` / `column` / `box` layout tree. `null` removes the slot; slots are per-extension and cleared when it is disabled.
- Push a **transient** notification with `ctx.ui.notify(message, level)` — use it for one-off events, and a render slot for anything that should persist.
- Rewrite a tool result by setting `event.payload.modifiedResult` in a `tool:after:<name>` interceptor (the middleware returns the modified result to the model).
- Access the runtime through `ctx.coreEnv` — the single source of truth for `rootPath`, filesystem, shell, fetch, path utilities, and env vars (see `demo-pi-like.mjs` `/ext-root`).
