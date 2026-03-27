# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"My Agent" — an AI coding agent built on Vercel AI SDK with a terminal UI and browser extension. pnpm monorepo with three packages:

- **`@my-agent/core`** — Core agent logic, tools, LLM providers, sandbox abstraction
- **`@my-agent/cli`** — Terminal UI using @my-react/react-terminal (React for terminal)
- **`@my-agent/extension`** — Browser extension using WXT framework

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build all (core first, then cli/extension)
pnpm dev                  # Watch mode for all packages
pnpm start:cli            # Run CLI after build
pnpm typecheck            # Type check all packages
pnpm lint                 # ESLint
pnpm format               # Prettier
pnpm build:core           # Build core only
pnpm build:cli            # Build CLI only
pnpm build:extension      # Build extension only
```

No test framework is configured. Use `pnpm typecheck` and `pnpm build` for validation.

After completing any task, always run: `pnpm lint`, `pnpm format`, then `pnpm build`.

## Architecture

### Core (`packages/core/src/`)

- **`agent/loop/`** — Main Agent class, tool execution, streaming, approval flows
- **`agent/tools/`** — 30+ tools (file ops, web ops, system ops, task, compact, skills)
- **`agent/agentContext/`** — Conversation state, tool calls, context management
- **`agent/subagent/`** — Context-isolated agents for delegated tasks (read-only tools, 30 step limit)
- **`agent/skills/`** — Two-layer on-demand knowledge injection (list_skills → load_skill)
- **`agent/compaction/`** — Three-layer context compression (micro_compact → auto_compact → compact tool)
- **`agent/mcp/`** — Model Context Protocol integration
- **`environment/`** — Sandbox abstraction (local via just-bash, native via direct fs, remote via computesdk)
- **`managers/`** — AgentManager, SandboxManager
- **`provider.ts`** — LLM provider adapters (OpenAI, Ollama, OpenRouter)

### CLI (`packages/cli/src/`)

- **`app/`** — Main App.tsx and Agent.tsx components
- **`hooks/`** — useAgent, useLocalChat, useArgs, etc. (reactivity-store with Zustand-like API)
- **`components/`** — Terminal UI components (MessageList, TodoList, etc.)
- **`markdown/`** — Streaming markdown parser with shiki syntax highlighting

### Extension (`packages/extension/`)

- WXT-based browser extension with React 19, @heroui/react, Tailwind CSS v4

## Code Conventions

- **ESM only** — all packages use `"type": "module"`. Use `.js` extensions in local imports.
- **Double quotes**, semicolons required, 2-space indent, 120 char line width
- **Import order**: external packages → local files (with `.js`) → type-only imports (with `type` keyword)
- **Naming**: camelCase files (utils), PascalCase files (React components), `create*` factories, `use*` hooks, SCREAMING_SNAKE_CASE constants
- **Workspace deps**: use `workspace:*` for cross-package dependencies
- **Build order**: core must build before cli/extension
- **State management**: reactivity-store with `createState()` — direct mutation allowed inside `withActions`
- **Tool pattern**: `createXxxTool({ sandbox })` factory returning `tool({ title, description, inputSchema, outputSchema, execute })`
- **Zod v4** for schemas

## Environment Config

`.env` at repo root configures the provider, model, API key, and sandbox type (`SANDBOX_ENV=local|native|remote`).
