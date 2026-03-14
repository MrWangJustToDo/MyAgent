# AGENTS.md - AI Agent Guidelines

This file provides guidelines for AI coding agents working in this repository.

## Project Overview

A pnpm monorepo with three packages:
- `@my-agent/core` - Core AI agent, tools, environment abstraction, and TanStack AI integration
- `@my-agent/cli` - Terminal CLI using Ink (React for terminal)
- `@my-agent/extension` - Browser extension using WXT framework

## Architecture

### TanStack AI Integration

This project uses **TanStack AI SDK** (`@tanstack/ai`, `@tanstack/ai-react`, `@tanstack/ai-client`) for AI interactions.

Key integration points:
- `connection.ts` - Creates a `ConnectionAdapter` that bridges TanStack AI's `useChat` hook with our local `Agent` class
- `Agent.ts` - Main agent loop that handles tool execution, approval flows, and streaming
- `AgentContext.ts` - Manages conversation state, tool calls, and context

### Known SDK Issues & Workarounds

#### Empty Tool Call Arguments (PR #372)

**Issue**: TanStack AI SDK has a bug where continuation re-executions only emit `TOOL_CALL_END`, skipping `TOOL_CALL_START` and `TOOL_CALL_ARGS`. This causes `StreamProcessor` to store tool calls with empty `arguments`.

**Workaround** (in `connection.ts`):
```typescript
// Store inputs from CUSTOM approval-requested events
const approvalInputs: ApprovalInputsMap = new Map();

// On CUSTOM chunk, store the input
if (chunk.type === "CUSTOM") {
  const { toolCallId, input } = chunk.value;
  approvalInputs.set(toolCallId, input);
}

// Before each connect, backfill missing arguments
const patchedMessages = backfillToolCallArguments(messages, approvalInputs);
```

**Reference**: https://github.com/TanStack/ai/pull/372

This workaround can be removed once PR #372 is merged.

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

- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-react`, `@tanstack/ai-client`) - AI SDK for LLM interactions
- **Zod** (v4.x) - Schema validation
- **Ink** - React for terminal UIs (CLI package)
- **WXT** - Browser extension framework
- **reactivity-store** - State management (Zustand-like API)
- **tsdown** - TypeScript build tool

## File Structure

```
packages/
├── core/src/
│   ├── agent/
│   │   ├── loop/           # Main Agent class
│   │   ├── tools/          # AI tools (read, write, grep, glob, bash, etc.)
│   │   ├── agentContext/   # AgentContext - conversation state management
│   │   ├── agentLog/       # AgentLog - structured logging system
│   │   └── index.ts        # Agent exports
│   ├── environment/        # Sandbox abstraction (local/remote)
│   ├── managers/           # Manager classes (AgentManager, SandboxManager)
│   ├── connection.ts       # TanStack AI ConnectionAdapter
│   ├── provider.ts         # LLM provider adapters (Ollama, etc.)
│   ├── index.ts            # Main exports
│   └── types.ts            # Type definitions
├── cli/src/
│   ├── app/                # Main app components (App, Agent)
│   ├── components/         # Ink React components
│   │   └── message/        # Message rendering (ToolCallPartView, etc.)
│   ├── hooks/              # CLI hooks (useAgent, useLocalChat, etc.)
│   ├── layout/             # Layout components (Header, Footer)
│   ├── markdown/           # Markdown rendering utilities
│   ├── utils/              # Utility functions
│   └── index.tsx           # Entry point
└── extension/
    ├── entrypoints/        # WXT entry points
    └── components/         # React components
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
