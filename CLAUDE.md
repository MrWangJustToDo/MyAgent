# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](AGENTS.md) for full architecture, code conventions, and detailed guidelines.

## Quick Reference

**Project:** "My Agent" — an AI coding agent built on TanStack AI. pnpm monorepo:

- **`@my-agent/core`** — Runtime-agnostic core: ManagedAgent runtime, tools, models, CoreEnv interface
- **`@my-agent/app`** — Shared UI layer: React components, hooks, adapter interface, commands
- **`@my-agent/cli`** — Terminal host using @my-react/react-terminal
- **`@my-agent/node`** — Node.js CoreEnv implementation (filesystem, shell, OS sandbox)
- **`@my-agent/server`** — CoreEnv HTTP server (Hono RPC) + remote client
- **`@my-agent/extension`** — Chrome extension host using WXT framework
- **`@my-agent/mcp-server`** — MCP server for external tool integration

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build all (core → app → rest)
pnpm dev                  # Watch mode for all packages
pnpm start:cli            # Run CLI after build
pnpm start:server         # Run CoreEnv HTTP server
pnpm typecheck            # Type check all packages
pnpm lint                 # ESLint
pnpm format               # Prettier
```

No test framework is configured. Use `pnpm typecheck` and `pnpm build` for validation.

After completing any task, always run: `pnpm lint`, `pnpm format`, then `pnpm build`.

## Key Rules

- **ESM only** — all packages use `"type": "module"`. Use `.js` extensions in local imports.
- **Double quotes**, semicolons required, 2-space indent, 120 char line width
- **Build order**: core → app → cli/node/server/extension (handled by `pnpm build`)
- **Zod v4** for schemas
- **Workspace deps**: use `workspace:*` for cross-package dependencies
- **CoreEnv is the single source of truth** for `rootPath`, platform info, and environment variables

## Architecture Layers

```
Hosts (CLI / Extension)
  └─ App Layer (@my-agent/app) — shared UI, AgentAdapter interface
      └─ Core Layer (@my-agent/core) — ManagedAgent, tools, CoreEnv registry
          └─ CoreEnv Adapter Layer (@my-agent/node local | @my-agent/server remote)
```

## Environment Config

`.env` at repo root configures the provider, model, API key, and sandbox type.

```bash
SANDBOX_ENV=local          # local (OS sandbox) | native (no sandbox)
REMOTE=http://localhost:3100  # remote CoreEnv server URL (CLI --remote flag)
```
