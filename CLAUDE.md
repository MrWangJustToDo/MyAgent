# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](AGENTS.md) for full architecture, code conventions, and detailed guidelines.

## Quick Reference

**Project:** "My Agent" — an AI coding agent built on Vercel AI SDK. pnpm monorepo:

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
```

No test framework is configured. Use `pnpm typecheck` and `pnpm build` for validation.

After completing any task, always run: `pnpm lint`, `pnpm format`, then `pnpm build`.

## Key Rules

- **ESM only** — all packages use `"type": "module"`. Use `.js` extensions in local imports.
- **Double quotes**, semicolons required, 2-space indent, 120 char line width
- **Build order**: core must build before cli/extension
- **Zod v4** for schemas
- **Workspace deps**: use `workspace:*` for cross-package dependencies

## Environment Config

`.env` at repo root configures the provider, model, API key, and sandbox type (`SANDBOX_ENV=local|native|remote`).
