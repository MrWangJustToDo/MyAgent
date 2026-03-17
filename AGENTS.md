# AGENTS.md - AI Agent Guidelines

This file provides guidelines for AI coding agents working in this repository.

## Project Overview

A pnpm monorepo with three packages:
- `@my-agent/core` - Core AI agent, tools, environment abstraction, and Vercel AI SDK integration
- `@my-agent/cli` - Terminal CLI using @my-react/react-terminal (React for terminal)
- `@my-agent/extension` - Browser extension using WXT framework

## Architecture

### Vercel AI SDK Integration

This project uses **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) for AI interactions.

Key integration points:
- `provider.ts` - LLM provider adapters (OpenAI, Ollama via `ai-sdk-ollama`)
- `agent/loop/` - Main Agent class that handles tool execution, approval flows, and streaming
- `agent/agentContext/` - Manages conversation state, tool calls, and context
- `agent/mcp/` - MCP (Model Context Protocol) integration

## Build, Lint, Test Commands

### Package Manager
```bash
pnpm install          # Install dependencies
```

### Build Commands
```bash
pnpm build            # Build all packages (core first, then others)
pnpm build:core       # Build core package only
pnpm build:cli        # Build CLI package only
pnpm build:extension  # Build extension only
```

### Development
```bash
pnpm dev              # Run all packages in watch mode (parallel)
pnpm dev:core         # Watch core package
pnpm dev:cli          # Watch CLI package
pnpm dev:extension    # Run extension dev server
pnpm start:cli        # Run CLI after build
```

### Type Checking & Linting
```bash
pnpm typecheck        # Type check all packages
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
```

### Per-Package Commands
```bash
cd packages/core && pnpm tsc --noEmit   # Type check core only
cd packages/cli && pnpm tsc --noEmit    # Type check CLI only
```

## Code Style Guidelines

### Formatting (Prettier)
- Double quotes for strings (`"string"`)
- Semicolons required
- 2 space indentation, no tabs
- 120 character line width
- Trailing commas in ES5 contexts

### TypeScript
- Target: ES2022
- Strict mode enabled
- ESM modules (`"type": "module"`)
- Use `.js` extensions in imports for local files (ESM requirement)

### Import Order & Style
```typescript
// 1. External packages (no extension)
import { tool } from "ai";
import { z } from "zod";

// 2. Local files (with .js extension)
import { createModel } from "./provider.js";
import { DEFAULT_OLLAMA_URL } from "./types.js";

// 3. Type-only imports (use `type` keyword)
import type { Sandbox } from "./environment/types.js";
import type { LanguageModel, ToolSet } from "ai";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (general) | camelCase | `useSandbox.ts`, `readFileTool.ts` |
| Files (React) | PascalCase | `App.tsx`, `Header.tsx` |
| Functions | camelCase | `createTools`, `getFile` |
| Factory functions | `create*` prefix | `createAgent`, `createModel` |
| Hooks | `use*` prefix | `useAgent`, `useTools` |
| Types/Interfaces | PascalCase | `AgentConfig`, `ToolCallInfo` |
| Zod schemas | camelCase + Schema | `agentConfigSchema` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_OLLAMA_URL` |

### Error Handling
```typescript
try {
  const result = await someOperation();
  return result;
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  onError?.(err);
  throw err;
}
```

### State Management (reactivity-store)
Uses Zustand-like API:
```typescript
export const useAgent = createState(() => ({ status: "idle", error: "" }), {
  withActions: (state) => ({
    setStatus: (status: string) => {
      state.status = status;  // Direct mutation allowed
    },
  }),
});

// Usage in components
const status = useAgent((s) => s.status);           // Reactive selector
const { setStatus } = useAgent.getActions();        // Non-reactive actions
```

### Tool Definition Pattern
```typescript
export const createReadFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    title: "read-file-tool",
    description: "Read file contents",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      offset: z.number().int().min(0).optional(),
    }),
    outputSchema: z.object({
      content: z.string(),
    }),
    execute: async ({ path }, { abortSignal }) => {
      // Implementation
    },
  });
};
```

### React Components
```typescript
export const MyComponent = () => {
  const config = useArgs((s) => s.config);

  return (
    <Box flexDirection="column">
      <Text>{config.model}</Text>
    </Box>
  );
};
```

### Documentation Style
Use JSDoc with examples for public APIs:
```typescript
/**
 * Create a new agent instance
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   model: "gpt-4",
 *   rootPath: "/path/to/project",
 * });
 * ```
 */
export async function createAgent(config: AgentConfig): Promise<Agent> {
```

Use section separators in large files:
```typescript
// ============================================================================
// Types & Schemas
// ============================================================================
```

## Key Technologies

### Core & CLI
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) - AI SDK for LLM interactions
- **ai-sdk-ollama** - Ollama provider for Vercel AI SDK
- **Zod** (v4.x) - Schema validation
- **@my-react/react-terminal** - React for terminal UIs (CLI package)
- **reactivity-store** - State management (Zustand-like API)
- **tsdown** - TypeScript build tool
- **shiki** - Syntax highlighting
- **stream-markdown-parser** - Markdown parsing and streaming
- **@git-diff-view** - Git diff visualization
- **computesdk** / **just-bash** - Remote compute and bash execution

### Extension
- **WXT** - Browser extension framework
- **@heroui/react** - UI component library
- **@floating-ui/react** - Floating UI positioning
- **framer-motion** - Animation library
- **lucide-react** - Icon library
- **swr** - Data fetching and caching
- **tailwindcss** (v4.x) - CSS framework

## File Structure

```
packages/
├── core/src/
│   ├── agent/
│   │   ├── loop/           # Main Agent class
│   │   ├── tools/          # AI tools (read, write, grep, glob, bash, etc.)
│   │   ├── agentContext/   # AgentContext - conversation state management
│   │   ├── agentLog/       # AgentLog - structured logging system
│   │   ├── mcp/            # MCP (Model Context Protocol) integration
│   │   └── index.ts        # Agent exports
│   ├── base/               # Base utilities and shared code
│   ├── environment/        # Sandbox abstraction (local/remote)
│   ├── managers/           # Manager classes (AgentManager, SandboxManager)
│   ├── translate/          # Translation utilities
│   ├── provider.ts         # LLM provider adapters (OpenAI, Ollama, etc.)
│   ├── schemas.ts          # Shared Zod schemas
│   ├── index.ts            # Main exports
│   └── types.ts            # Type definitions
├── cli/src/
│   ├── app/                # Main app components (App, Agent)
│   ├── components/         # React terminal components
│   ├── hooks/              # CLI hooks (useAgent, useLocalChat, etc.)
│   ├── layout/             # Layout components (Header, Footer)
│   ├── markdown/           # Markdown rendering utilities
│   ├── messages/           # Message rendering components
│   ├── utils/              # Utility functions
│   └── index.tsx           # Entry point
└── extension/
    ├── entrypoints/        # WXT entry points (background, content, popup)
    ├── components/         # React components
    ├── devtool/            # DevTools panel components
    ├── hooks/              # Extension-specific hooks
    ├── service/            # Background service utilities
    └── assets/             # Static assets
```

## Task Completion Checklist

After completing each task, you MUST:

1. **Run lint and fix issues**:
   ```bash
   pnpm lint             # Check for lint errors
   pnpm format           # Auto-fix formatting issues
   ```

2. **Run build to verify**:
   ```bash
   pnpm build            # Build all packages
   ```

3. **Fix any errors before marking task complete**

This ensures code quality and prevents accumulation of lint/type errors.

## Important Notes

1. **ESM Only** - All packages use ESM. Use `.js` extensions in imports.
2. **Workspace Dependencies** - Use `workspace:*` for cross-package deps.
3. **Build Order** - Core must build before CLI/extension (`pnpm build` handles this).
4. **Type Exports** - Use `export type` for type-only exports.
5. **No Test Framework** - Currently no tests configured. Use TypeScript compiler for validation.
