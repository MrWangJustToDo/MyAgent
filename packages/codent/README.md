# codent

AI coding agent for your terminal. Local workspace, local model keys, one install.

> Published on npm as **`codent-cli`** — the installed *command* is **`codent`**.
> Currently **0.0.1-beta.1**, a pre-release. Source: [MrWangJustToDo/MyAgent](https://github.com/MrWangJustToDo/MyAgent).

`codent` is the **release host** for this monorepo: a local-only terminal CLI that ships as a
single fully bundled, self-contained tarball. `@codent/app`, `@codent/core` and
`@codent/node` are inlined into `dist`, so installing it does not pull any `@codent/*`
package from the registry.

## Install

Requires **Node.js 24+**.

```bash
npm install -g codent-cli
codent
```

```bash
npm install -g codent-cli@beta    # pin the pre-release explicitly
```

## Configure

First run opens a config editor and writes `.agents/config/models.json`. You can also use a
`.env` file in your project root:

```bash
MODEL_STYLE=openai          # openai | anthropic
MODEL=anthropic/claude-3.5-sonnet
BASE_URL=https://openrouter.ai/api/v1
API_KEY=sk-or-v1-xxx
maxIterations=30

# Optional
BRAVE_API_KEY=...           # websearch
WEBSEARCH_PROVIDER=...      # override the websearch provider
MCP_CONFIG_PATH=...         # MCP server config
```

Priority: CLI args > env vars > defaults.

## Usage

```bash
codent "Create a hello world function"
codent -m gpt-4o -u https://api.openai.com/v1 -k sk-... "Review this code"
codent --continue           # resume the most recent session
codent --resume             # pick a session
```

`codent -h` lists every flag and keyboard shortcut.

## Difference from `@codent/cli`

> The published name is **`codent-cli`**; it is *not* `@codent/cli`. `@codent/cli` is the
> internal development host in `packages/cli` and is never published on its own, so
> `npm install -g @codent/cli` does not work. The installed *command* is `codent` either way.

This package is intentionally narrower than the development CLI in `packages/cli`:

| | published `codent-cli` | internal `@codent/cli` |
|---|---|---|
| Workspace | local Node.js only | local **or** `--remote-env` |
| Model keys | local `.env` / flags | local **or** `--remote-provider` |
| Agent loop | in-process only | in-process **or** `--remote-session` |
| Distribution | one self-contained tarball | declares `@codent/*` runtime deps |

The remote planes live in `@codent/server` and stay on the dev CLI.

## Why the bundle looks the way it does

Two groups of dependencies must stay **external**, and are the only four packages a consumer
installs (see `dependencies` in `package.json`):

1. **Renderer** — `@my-react/react` + `@my-react/react-terminal`. The host must resolve exactly
   one copy; two physical copies means two hook dispatchers and the TUI renders nothing. npm
   does not dedupe an alias against a real package name, which is why the app layer names the
   real packages instead of aliasing `react` / `ink` and rewrites the specifiers at build time.
2. **Asset-bearing packages** — `@anthropic-ai/sandbox-runtime` (seccomp / Windows helper
   binaries under `vendor/`) and `web-tree-sitter` (`tree-sitter.wasm`). Both locate their
   assets relative to their own module URL, which only works from a real on-disk layout.

Everything else is inlined, including dynamic `import()`s such as PDF text extraction and the
code-mode isolate, so those degrade gracefully instead of failing to resolve.

`pnpm validate:self-contained` asserts both properties against `dist`.
