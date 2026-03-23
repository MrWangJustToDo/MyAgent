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

## Subagent System

The project supports **subagents** - context-isolated agents that can be spawned to handle delegated tasks without polluting the parent's context.

### When to Use Subagents

Use subagents when you need to:
- Explore the codebase to find specific information
- Research a question that requires reading multiple files
- Perform complex multi-step exploration

### Subagent Characteristics

| Feature | Behavior |
|---------|----------|
| Context | Fresh (starts with empty messages) |
| Tools | Read-only: `read_file`, `glob`, `grep`, `run_command`, `list_file`, `tree` |
| Return | Summary only (full history discarded) |
| Iteration Limit | 30 steps max |
| Summary Limit | 5000 characters max |

### Using the Task Tool

The parent agent uses the `task` tool to spawn subagents:

```typescript
// Agent invokes the task tool with a prompt
{
  tool: "task",
  input: {
    prompt: "Find what testing framework this project uses",
    description: "find-test-framework"  // Optional, for UI display
  }
}
```

### Programmatic Subagent Usage

```typescript
import { runSubagent } from "@my-agent/core";

// Spawn a subagent
const result = await runSubagent({
  prompt: "Find all API endpoints in the codebase",
  parentAgentId: agent.id,
  agentManager: manager,
});

// Result contains:
// - summary: string (findings from the subagent)
// - iterations: number (how many steps it took)
// - usage: { inputTokens, outputTokens, totalTokens }
// - truncated: boolean (if summary was truncated)
// - reachedLimit: boolean (if hit 30 iteration limit)
```

### Architecture

```
packages/core/src/agent/
├── subagent/
│   ├── subagent.ts    # runSubagent(), SubagentConfig, SubagentResult
│   └── index.ts       # Exports
├── tools/
│   └── task-tool.ts   # createTaskTool() for parent agents
```

### Events

The AgentManager emits these subagent events:
- `subagent:created` - Subagent spawned
- `subagent:started` - Subagent began executing
- `subagent:step` - Each iteration
- `subagent:completed` - Task finished
- `subagent:error` - Error occurred
- `subagent:destroyed` - Subagent cleaned up

## Skill System

The project supports **skills** - on-demand domain knowledge loaded via tools. This implements a two-layer injection pattern to avoid bloating the system prompt.

### Two-Layer Pattern

| Layer | Purpose | Tokens |
|-------|---------|--------|
| Layer 1 | `list_skills` tool for discovery | ~100/skill |
| Layer 2 | `load_skill` tool for full content | ~2000+/skill |

### Skill File Format

Skills are defined in `SKILL.md` files with YAML frontmatter:

```markdown
---
name: git-workflow
description: Git workflow helpers and conventions
license: MIT
metadata:
  author: your-name
  version: "1.0"
---

[Full skill content as markdown...]
```

### Using Skills

Agents discover and load skills on-demand:

```typescript
// 1. Discover available skills
{
  tool: "list_skills",
  input: {}
}
// Returns: Available skills:
//   - git-workflow: Git workflow helpers...
//   - code-review: Code review checklist...

// 2. Load a specific skill
{
  tool: "load_skill",
  input: { name: "git-workflow" }
}
// Returns: <skill name="git-workflow">...</skill>
```

### Configuration

Configure skill directories in agent config:

```typescript
const agent = await agentManager.createManagedAgent({
  name: "my-agent",
  rootPath: "/project",
  languageModel: model,
  skillDirs: [".opencode/skills", "./custom-skills"],  // Optional, default: [".opencode/skills"]
});
```

### Architecture

```
packages/core/src/agent/
├── skills/
│   ├── types.ts          # Skill, SkillMetadata types
│   ├── skill-loader.ts   # Parse SKILL.md files
│   ├── skill-registry.ts # Manage loaded skills
│   └── index.ts          # Exports
├── tools/
│   ├── list-skills-tool.ts  # list_skills tool
│   └── load-skill-tool.ts   # load_skill tool
```

### Default Skill Location

Skills are loaded from `.opencode/skills/` by default:

```
.opencode/
└── skills/
    ├── git-workflow/
    │   └── SKILL.md
    ├── code-review/
    │   └── SKILL.md
    └── testing-patterns/
        └── SKILL.md
```

## Context Compaction System

The project implements a **three-layer context compaction system** for infinite agent sessions. This prevents context window overflow by strategically compressing conversation history.

### Three-Layer Architecture

| Layer | Name | Trigger | Action |
|-------|------|---------|--------|
| Layer 1 | `micro_compact` | Every LLM call | Replace old tool results with placeholders |
| Layer 2 | `auto_compact` | Token threshold exceeded | Save transcript + LLM summarization |
| Layer 3 | `compact` tool | Manual agent trigger | Same as auto_compact |

### Layer 1: Micro Compaction

Runs automatically in `prepareMessages()` before each LLM call:
- Replaces old tool_result content with `[Previous: used {tool_name}]`
- Preserves the N most recent tool results (default: 3)
- Skips small results (< 100 chars)

```typescript
// Automatic - no explicit call needed
// Configured via compaction.keepRecentToolResults
```

### Layer 2: Auto Compaction

Triggers when estimated tokens exceed threshold:
1. Saves full conversation to `.transcripts/transcript_{timestamp}.jsonl`
2. Uses LLM to generate structured summary
3. Replaces all messages with summary + acknowledgment

**Important**: Auto compaction is **blocked** if there are incomplete todos (pending or in_progress). This ensures task context is preserved until work is complete.

```typescript
// Check if compaction is needed (also checks for incomplete todos)
if (agent.shouldAutoCompact(messages)) {
  const result = await autoCompact(messages, config, model, sandbox);
  // result.messages contains the compressed conversation
}

// Check if compaction is blocked due to incomplete todos
if (agent.isCompactionBlocked()) {
  console.log("Cannot compact: incomplete todos exist");
}
```

### Layer 3: Compact Tool

Manual trigger via the `compact` tool:

```typescript
// Agent can call this tool when context is getting large
{
  tool: "compact",
  input: {
    focus: "preserve the API design decisions",  // Optional
    force: false  // Set to true to compact even with incomplete todos (not recommended)
  }
}
```

**Note**: The compact tool will refuse to run if there are incomplete todos, unless `force: true` is specified. This prevents losing important task context.

### Configuration

Configure compaction in agent config:

```typescript
const agent = await agentManager.createManagedAgent({
  name: "my-agent",
  rootPath: "/project",
  languageModel: model,
  compaction: {
    enabled: true,               // Default: true
    tokenThreshold: 100000,      // Default: 100000 (~100k tokens)
    keepRecentToolResults: 3,    // Default: 3
    transcriptDir: ".transcripts", // Default: ".transcripts"
    minToolResultSize: 100,      // Default: 100 chars
  },
});
```

### Token Counting

The compaction system uses **actual token usage** from AgentContext when available (more accurate), falling back to character-based estimation when needed.

```typescript
// Actual usage from context (preferred)
const usage = agent.getContext().getUsage();
console.log(`Actual tokens used: ${usage.inputTokens}`);

// Check if compaction needed using actual usage
if (agent.shouldAutoCompact()) {
  // Triggers based on context.inputTokens >= threshold
}

// Character-based estimation (fallback)
import { estimateTokens } from "@my-agent/core";
const estimated = estimateTokens(messages);
console.log(`Estimated tokens: ${estimated}`);
```

Token estimation uses: `tokens ≈ characters / 4`

### Transcript Storage

When compaction occurs, full conversation is saved to JSONL:

```
.transcripts/
├── transcript_2024-01-15T10-30-00-000Z.jsonl
├── transcript_2024-01-15T14-45-30-500Z.jsonl
└── ...
```

Each line is a JSON object: `{ timestamp, role, content }`

### Architecture

```
packages/core/src/agent/
├── compaction/
│   ├── types.ts            # CompactionConfig, CompactionResult types
│   ├── token-estimator.ts  # estimateTokens(), estimateMessageTokens()
│   ├── compaction-prompt.ts # COMPACTION_PROMPT, buildCompactionPrompt()
│   ├── micro-compact.ts    # microCompact() - Layer 1
│   ├── auto-compact.ts     # autoCompact(), shouldAutoCompact() - Layer 2
│   └── index.ts            # Exports
├── tools/
│   └── compact-tool.ts     # compact tool - Layer 3
├── loop/
│   └── base.ts             # prepareMessages() integration
```

### Integration Points

1. **prepareMessages()** in `base.ts` - Applies micro_compact automatically
2. **shouldAutoCompact()** - Check before LLM call if threshold exceeded
3. **compact tool** - Manual trigger by agent

## File Structure

```
packages/
├── core/src/
│   ├── agent/
│   │   ├── loop/           # Main Agent class
│   │   ├── subagent/       # Subagent for delegated tasks (read-only, context-isolated)
│   │   ├── skills/         # Skill loading system (two-layer injection)
│   │   ├── compaction/     # Context compaction system (three-layer compression)
│   │   ├── tools/          # AI tools (read, write, grep, glob, bash, task, skills, compact, etc.)
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
