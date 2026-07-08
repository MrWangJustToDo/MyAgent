# AGENTS.md - AI Agent Guidelines

This file provides guidelines for AI coding agents working in this repository.

## Project Overview

A pnpm monorepo with seven packages organized in a layered architecture.

**Core runtime deep-dive:** [packages/core/ARCHITECTURE.md](packages/core/ARCHITECTURE.md) — startup, initialization, session/memory/compaction/approval flows.

| Package | Role |
|---------|------|
| `@my-agent/core` | Runtime-agnostic core: agent loop, tools, LLM model factory, CoreEnv interface |
| `@my-agent/app` | Shared UI layer: React components, hooks, commands, AgentAdapter interface |
| `@my-agent/cli` | Terminal host — thin shell that registers CoreEnv and renders `@my-agent/app` |
| `@my-agent/node` | Node.js CoreEnv implementation: native filesystem, shell, OS sandbox |
| `@my-agent/server` | CoreEnv HTTP server (Hono RPC) + remote client factory |
| `@my-agent/extension` | Chrome extension host using WXT framework |
| `@my-agent/mcp-server` | MCP server for external tool integration |

## Architecture

### Layered Design

```
┌─────────────────────────────────────────────────────────┐
│  Runtime Hosts                                          │
│  ┌──────────────────┐  ┌────────────────────────────┐   │
│  │  @my-agent/cli   │  │  @my-agent/extension       │   │
│  │  (Ink terminal)  │  │  (WXT Chrome extension)    │   │
│  └────────┬─────────┘  └─────────────┬──────────────┘   │
│           │     AgentAdapter          │                  │
│  ┌────────┴───────────────────────────┴──────────────┐   │
│  │  @my-agent/app  (shared UI, hooks, commands)      │   │
│  └────────────────────────┬──────────────────────────┘   │
│                           │  AgentManager / Tools        │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │  @my-agent/core  (agent loop, tools, CoreEnv)     │   │
│  └────────────────────────┬──────────────────────────┘   │
│                           │  CoreEnv interface           │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │  CoreEnv Adapter Layer                            │   │
│  │  ┌──────────────────┐  ┌────────────────────────┐ │   │
│  │  │ @my-agent/node   │  │ @my-agent/server       │ │   │
│  │  │ (local Node.js)  │  │ (remote HTTP client)   │ │   │
│  │  └──────────────────┘  └───────────┬────────────┘ │   │
│  └────────────────────────────────────┼──────────────┘   │
│                                       │ Hono RPC         │
│  ┌────────────────────────────────────┴──────────────┐   │
│  │  @my-agent/server (HTTP server, uses @my-agent/node)  │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### CoreEnv — Runtime Abstraction

`CoreEnv` is the central abstraction that decouples `@my-agent/core` from any specific runtime. All filesystem, shell, fetch, and platform APIs go through this interface.

```typescript
interface CoreEnv {
  rootPath: string;                // Workspace root
  path?: CoreEnvPath;              // Synchronous path utilities (defaults to pathe/POSIX)
  getPlatform(): Promise<string>;  // Async — may query remote server
  getArch(): Promise<string>;
  getEnv(): Promise<Record<string, string | undefined>>;
  homedir(): Promise<string>;
  fs: CoreEnvFs;                   // Filesystem operations
  runCommand(cmd, opts?): Promise<CommandResult>;
  exec(cmd, opts?): Promise<CoreEnvExecResult>;
  fetch(input, init?): Promise<Response>;
  destroy?(): Promise<void>;       // Lifecycle cleanup
  // Optional: byteLength, base64Encode/Decode, getMimeType, createMCPStdioTransport
}
```

**Registry pattern:**
```typescript
import { registerCoreEnv, getEnv, clearCoreEnv, hasCoreEnv } from "@my-agent/core";

registerCoreEnv(env);   // Set the global CoreEnv (must be called before any core usage)
getEnv();               // Get resolved env with defaults applied
clearCoreEnv();         // Clear the registry (call on disconnect/destroy)
hasCoreEnv();           // Check if registered
```

**Implementations:**
- `createNodeEnv()` from `@my-agent/node` — local Node.js APIs, optional OS sandbox
- `createRemoteCoreEnv(url)` from `@my-agent/server/client` — HTTP RPC proxy to a remote server

### AgentAdapter — Host Abstraction

Each host (CLI, extension) provides an `AgentAdapter` implementation:

```typescript
interface AgentAdapter {
  initialize(config: AppConfig): Promise<InitResult>;
  createTransport(): ChatTransport<UIMessage>;
  destroy(): Promise<void>;
  exit(): void;
  readClipboardImage?(): Promise<ClipboardImageResult | null>;
}
```

Shared initialization logic is in `createAgentFromConfig()` (`@my-agent/app/adapter/create-agent.ts`). Both `LocalAgentAdapter` (CLI) and `ExtensionAgentAdapter` delegate to this helper.

### Bootstrap Sequences

**CLI (local):**
```
loadEnv → parseCliArgs (sync) → registerCoreEnv(createNodeEnv) → initConfig → render(App)
```

**CLI (remote):**
```
loadEnv → parseCliArgs (sync) → createRemoteCoreEnv(url) → registerCoreEnv → initConfig → render(App)
```

**Extension:**
```
ConnectionGuard(/health) → createRemoteCoreEnv(url) → registerCoreEnv → initConfig → render(App)
```

### @my-agent/core Public API

`packages/core/src/index.ts` exports a **curated** surface for hosts and adapters — not a barrel of every internal module:

| Category | Examples |
|----------|----------|
| CoreEnv | `registerCoreEnv`, `getEnv`, `CoreEnv` types |
| Runtime | `agentManager`, `AgentManager`, `ManagedAgent`, `localConnect` |
| UI / state | `AgentContext`, `AgentLog`, `TodoManager`, `SessionStore` |
| Compaction | `applyCompactionResult`, `autoCompact`, `estimateTokens` |
| Bootstrap | `buildDefaultSystemPrompt`, `parseModelInfoFromEnv`, `bridgeExternalToolToServer` |
| UI helpers | `previewEdit`, streaming callbacks, tool output types |
| Adapters | `FileError`, `ExecutionError`, `generateId` |

Internal modules (tools, middleware, subagent runner, hook registry, etc.) stay package-private. Core validation scripts import from `dist/dev.mjs` (`src/dev.ts`), which is not part of the published package export map.

### TanStack AI Integration

`@my-agent/core` uses **TanStack AI** (`@tanstack/ai`, provider adapters) for agent execution.

Key integration points:
- `core/src/models/model-config.ts` — connection resolution (`openai` | `anthropic` style, baseURL, apiKey, models.dev metadata)
- `core/src/models/adapter-factory.ts` — TanStack text adapters (`createOpenaiChatCompletions`, `createAnthropicChat`)
- `core/src/managers/run-agent.ts` — `AgentRunner` + `chat()` stream, compaction middleware
- `core/src/agent/agent-context/` — Conversation state, tool calls, context management
- `core/src/agent/mcp/` — MCP via `@tanstack/ai-mcp`
- `app/src/hooks/use-agent-chat.ts` — React hook via TanStack `useChat` + `localConnect`

## Build, Lint, Test Commands

### Package Manager
```bash
pnpm install          # Install dependencies
```

### Build Commands
```bash
pnpm build            # Build all packages (core → app → rest)
pnpm build:core       # Build core package only
pnpm build:app        # Build app package only
pnpm build:cli        # Build CLI package only
pnpm build:server     # Build server package only
pnpm build:extension  # Build extension only
```

### Development
```bash
pnpm dev              # Run all packages in watch mode (parallel)
pnpm dev:core         # Watch core package
pnpm dev:app          # Watch app package
pnpm dev:cli          # Watch CLI package
pnpm dev:server       # Watch server package
pnpm dev:extension    # Run extension dev server
pnpm start:cli        # Run CLI after build
pnpm start:server     # Run CoreEnv HTTP server
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
cd packages/app && pnpm tsc --noEmit    # Type check app only
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
import { resolveModelConfig } from "./models/model-config.js";
import { DEFAULT_LOCAL_OPENAI_BASE_URL } from "./types.js";

// 3. Type-only imports (local first, then external, alphabetical within each group)
import type { AppConfig } from "./adapter/types.js";
import type { ManagedAgent } from "@my-agent/core";
import type { LanguageModel, ToolSet } from "ai";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (general) | kebab-case | `use-agent.ts`, `read-file-tool.ts` |
| Files (React) | PascalCase | `App.tsx`, `Header.tsx` |
| Functions | camelCase | `createTools`, `getFile` |
| Factory functions | `create*` prefix | `createAgent`, `createModel` |
| Hooks | `use*` prefix | `useAgent`, `useConfig` |
| Types/Interfaces | PascalCase | `AgentConfig`, `ToolCallInfo` |
| Zod schemas | camelCase + Schema | `agentConfigSchema` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_LOCAL_OPENAI_BASE_URL` |

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

**Typed errors:** Use `FileError` and `ExecutionError` (from `@my-agent/core`) for structured error handling across local/remote boundaries. These serialize/deserialize correctly over HTTP.

```typescript
import { FileError, ExecutionError } from "@my-agent/core";

// Filesystem errors
throw new FileError("not_found", "File not found", "/path/to/file");
throw new FileError("permission_denied", "Path traversal blocked", inputPath);

// Execution errors
throw new ExecutionError("timeout", "Command timed out after 30s");
throw new ExecutionError("aborted", "Command was aborted");
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
export const createReadFileTool = () => {
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
      const env = getEnv();
      const content = await env.fs.readFile(path);
      return { content };
    },
  });
};
```

### React Components
```typescript
export const MyComponent = () => {
  const config = useConfig((s) => s.config);

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
 * const agent = await agentManager.createManagedAgent({
 *   name: "main",
 *   model: "gpt-4o",
 *   modelStyle: "openai",
 *   modelBaseURL: "https://api.openai.com/v1",
 * });
 * ```
 */
```

Use section separators in large files:
```typescript
// ============================================================================
// Types & Schemas
// ============================================================================
```

## Key Technologies

### Core & App
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-client`, provider adapters) — LLM agent loop and streaming
- **@tanstack/ai-client** — `useChat` + `localConnect` in the app layer
- **Zod** (v4.x) — Schema validation
- **pathe** — Cross-runtime POSIX path utilities
- **reactivity-store** — State management (Zustand-like API)
- **tsdown** — TypeScript build tool
- **shiki** / **ink-stream-markdown** — Syntax highlighting and markdown rendering
- **@git-diff-view** — Git diff visualization

### CLI
- **@my-react/react-terminal** — React for terminal UIs
- **ink** — Terminal rendering (aliased from @my-react/react-terminal)

### Node
- **@anthropic-ai/sandbox-runtime** — OS-level sandbox for command execution
- **mime-types** — MIME type detection
- **@ai-sdk/mcp** — MCP stdio transport

### Server
- **Hono** — HTTP framework
- **@hono/zod-validator** — Request validation
- **hono/client** (RPC) — Type-safe client generation

### Extension
- **WXT** — Browser extension framework
- **@heroui/react** — UI component library
- **tailwindcss** (v4.x) — CSS framework

## CoreEnv Server (Remote Mode)

The `@my-agent/server` package exposes CoreEnv APIs over HTTP using Hono RPC for end-to-end type safety.

### Server Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check, returns rootPath and sandbox mode |
| `/api/env/info` | GET | Platform info: rootPath, platform, arch, homedir, sep |
| `/api/env/vars` | GET | Environment variables (sensitive vars filtered) |
| `/api/env/destroy` | POST | Lifecycle cleanup |
| `/api/fs/*` | POST | Filesystem operations (readFile, stat, writeFile, etc.) |
| `/api/command/run` | POST | Run a shell command |
| `/api/command/exec` | POST | Execute a simple command |
| `/api/fetch/proxy` | POST | HTTP fetch proxy (handles binary via base64) |
| `/api/mcp/init` | POST | Create a new MCP stdio process session |
| `/api/mcp/:id/message` | POST | Send a JSON-RPC message to an MCP session |
| `/api/mcp/:id` | DELETE | Clean up an MCP stdio process session |

### Client Usage

```typescript
import { registerCoreEnv } from "@my-agent/core";
import { createRemoteCoreEnv } from "@my-agent/server/client";

const env = await createRemoteCoreEnv("http://localhost:3100");
registerCoreEnv(env);
```

### Known Limitations
- `runCommand` streaming is lost over HTTP — stdout/stderr only available in final result
- Binary fetch responses are base64-encoded over the wire

## Agent Event System

`AgentManager` owns an `AgentEventBus` for lifecycle events. Emit via `emitAgentEvent()` / `ManagedAgent.emitEvent()`; subscribe with `agentManager.on(type, listener)`.

| Event | When emitted |
|-------|----------------|
| `session:doc` / `session:skill` / `session:mcp` / `session:memory` | After agent registration during bootstrap |
| `session:start` | Bootstrap complete |
| `prompt:submit` | Run prepared |
| `agent:thinking` | Model reasoning stream starts |
| `agent:tool-start` / `agent:tool-end` / `agent:tool-error` | Tool lifecycle (hooks middleware) |
| `agent:abort` / `agent:stream-error` | User abort / stream failure |
| `agent:stop` | Run finished or aborted |
| `memory:prefetch` | Relevant memory injection before run |
| `memory:extract` / `memory:consolidate` | Post-run memory extraction |
| `compaction:auto-*` / `compaction:reactive-*` | Auto / reactive context compaction |
| `session:save-error` | Session persistence failure |
| `subagent:*` | Subagent lifecycle |

**Event → Log bridge:** `attachEventLogBridge()` in `AgentManager` maps events to `AgentLog` entries. Policy lives in `event-log-bridge.ts` (`DEFAULT_EVENT_LOG_RULES`); override per event type with `EventLogPolicy`. Emit sites should not duplicate lifecycle logs covered by events.

## Subagent System

The project supports **subagents** — context-isolated agents spawned to handle delegated tasks.

### Subagent Characteristics

| Feature | Behavior |
|---------|----------|
| Context | Fresh (starts with empty messages) |
| Tools | Read-only: `read_file`, `glob`, `grep`, `list_file`, `tree` (no `run_command`) |
| Return | Summary only to parent LLM context; UI keeps a read-only UIMessage preview |
| Iteration Limit | 30 steps max |
| Summary Limit | 5000 characters max |
| UI Preview | `ManagedAgent.ui` (`AgentUIChannel`) + `Ctrl+T` task panel; inline task UI shows tool progress + summary stream |

### Subagent UI Preview

`runSubagent()` attaches an `AgentUIChannel` on `ManagedAgent.ui` for the task panel (`Ctrl+T`).
The default task tool row shows the current subagent tool (like before); during the final summary step,
text streams via `emitStreamingChunk` into `StreamingOutputView` (plain last lines, like `run_command`).
Only the last text-only step is returned to the parent as the task `summary`.


```typescript
{
  tool: "task",
  input: {
    prompt: "Find what testing framework this project uses",
    description: "find-test-framework"
  }
}
```

### Architecture

```
packages/core/src/agent/
├── subagent/
│   ├── run-subagent.ts # runSubagent(), getSubagent(), destroySubagent()
│   ├── run-stats.ts    # Iteration/limit stats from UI messages + stream
│   ├── tools.ts      # Read-only tool set for subagents
│   └── index.ts
├── tools/
│   └── task-tool.ts  # createTaskTool() for parent agents
```

## Skill System

Skills provide on-demand domain knowledge via a two-layer injection pattern.

| Layer | Purpose | Tokens |
|-------|---------|--------|
| Layer 1 | `list_skills` tool for discovery | ~100/skill |
| Layer 2 | `load_skill` tool for full content | ~2000+/skill |

Skills are defined in `SKILL.md` files with YAML frontmatter and loaded from `.opencode/skills/` by default.

```
packages/core/src/agent/skills/
├── skill-loader.ts     # Parse SKILL.md files
├── skill-registry.ts   # Manage loaded skills
└── index.ts
```

## Context Compaction System

Three-layer context compaction (plus reactive compaction) for infinite agent sessions:

| Layer | Name | Trigger | Action |
|-------|------|---------|--------|
| Layer 1 | `micro_compact` | Every LLM call | Replace old tool results with placeholders |
| Layer 2 | `reasoning_stripping` | Every LLM call (DeepSeek models) | Strip reasoning content from history to optimize prefix cache |
| Layer 3 | `auto_compact` | Token threshold exceeded | LLM summarization |
| Reactive | `reactive_compact` | `prompt_too_long` API error | Emergency compaction, then retry |

**Configuration:**
```typescript
const agent = await agentManager.createManagedAgent({
  name: "my-agent",
  model: "gpt-4o",
  modelStyle: "openai",
  modelBaseURL: "https://api.openai.com/v1",
  compaction: {
    tokenThreshold: 100000,
    keepRecentToolResults: 3,
    minToolResultSize: 100,
    keepRecentFlows: 4,
  },
});
```

**Auto-compact cut-point strategy:** `findCutPoint()` counts assistant-tool "flows" from the end and keeps the latest N (default: 4). Everything before is summarized.

```
packages/core/src/agent/compaction/
├── micro-compact.ts       # Layer 1 — replace old tool results with placeholders
├── auto-compact.ts        # Layer 3 — LLM summarization when token threshold exceeded
├── reactive-compact.ts    # Reactive — emergency compaction on prompt_too_long errors
├── apply-compaction-result.ts
├── compaction-prompt.ts
├── file-ops-tracker.ts    # Track file operation tool calls for compaction decisions
├── message-utils.ts       # Shared message manipulation helpers
├── serialize-conversation.ts  # Serialize conversation for compaction input
├── token-estimator.ts
├── types.ts
└── index.ts
```

**Reasoning stripping (Layer 2)** runs in `compaction-middleware.ts` (`stripReasoningFromHistory`) — for DeepSeek models without the `reasoning` capability, it strips thinking content from history to optimize prefix cache hits. Reasoning-capable models skip stripping because the API requires `reasoning_content` echo-back.

**Reactive compaction** runs in `run-agent.ts` via `runStreamWithReactiveCompactRetry` — on `prompt_too_long` errors, `ManagedAgent.handleReactiveCompact()` compacts context and retries once.

## Sandbox Environment Configuration

Configure via `SANDBOX_ENV` environment variable or programmatically.

| Value | Description |
|-------|-------------|
| `local` | (default) Real bash + OS sandbox via `@anthropic-ai/sandbox-runtime` |
| `native` | Real bash and Node.js fs, no OS sandbox |

```bash
# .env
SANDBOX_ENV=local   # or 'native'
```

```typescript
import { createNodeEnv } from "@my-agent/node";

createNodeEnv({ rootPath: "/path", mode: "os" });      // OS sandbox
createNodeEnv({ rootPath: "/path", mode: "native" });   // No sandbox
```

## Tool Output Truncation

### grep Tool
- Max 500 chars per matching line content
- Max 50KB total content across all matches

### read_file Tool

| Type | Extensions | Behavior |
|------|------------|----------|
| Text | `.ts`, `.js`, `.py`, `.md`, etc. | Line-numbered content, offset/limit pagination |
| Directory | (path to directory) | List of entries |
| Image | `.png`, `.jpg`, `.gif`, `.webp`, `.svg` | Base64 for LLM vision |
| PDF | `.pdf` | Base64 for document analysis |
| Binary | `.mp3`, `.zip`, `.exe`, etc. | Error (cannot read) |

**Text limits:** 2000 lines default, max 100KB, max 2000 chars/line.

### run_command Tool
- Max 50KB for stdout and stderr each
- Keeps the **end** of output (most relevant for errors)

## CLI Keyboard Shortcuts

| Key | When Running | When Idle | When Approval Pending |
|-----|--------------|-----------|----------------------|
| `Esc` | Aborts current agent run | - | Cancel deny-reason input |
| `Ctrl+C` | Exits the app | Exits the app | Exits the app |
| `Ctrl+U` | - | Clear input | - |
| `Ctrl+A` | - | Select all | - |
| `Ctrl+V` | - | Paste image | - |
| `y` | - | - | Approve (when input empty) |
| `n` | - | - | Enter deny-reason mode |
| `↑/↓` | - | Navigate history / autocomplete | Navigate autocomplete |
| `Enter` | - | Submit input | Submit deny reason |
| `/...` | - | Slash commands | Slash commands |

## File Structure

```
packages/
├── core/src/                          # @my-agent/core — runtime-agnostic core
│   ├── env.ts                         # CoreEnv interface, registry (registerCoreEnv/getEnv/clearCoreEnv)
│   ├── agent/
│   │   ├── agent-context/             # AgentContext — messages + compaction only
│   │   ├── agent-log/                 # AgentLog — structured logging
│   │   ├── compaction/                # Context compaction (micro + auto)
│   │   ├── hooks/                     # Hook system (pre/post tool execution)
│   │   ├── memory/                    # Memory management
│   │   ├── session/                   # Session persistence (SessionStore)
│   │   ├── skills/                    # Skill loading (two-layer injection)
│   │   ├── subagent/                  # Subagent spawning
│   │   ├── todo-manager/             # Todo tracking for agent tasks
│   │   ├── tools/                     # AI tools (fs, bash, grep, glob, etc.)
│   │   ├── mcp/                       # MCP integration
│   │   ├── default-prompt.ts          # System prompt builder
│   │   └── agent-doc-loader.ts        # Agent documentation loader
│   ├── environment/                   # Error types (FileError, ExecutionError), data types
│   ├── managers/                      # AgentManager, ManagedAgent (hub), services, run pipeline
│   ├── models/                        # Model config (model-config.ts), adapters, models.dev lookup
│   ├── types.ts                       # Shared type definitions
│   ├── index.ts                       # Curated public API exports (hosts / adapters)
│   └── dev.ts                         # Internal-only re-exports for `pnpm validate:*` scripts
│
├── app/src/                           # @my-agent/app — shared UI layer
│   ├── adapter/
│   │   ├── types.ts                   # AgentAdapter, AppConfig, InitResult interfaces
│   │   └── create-agent.ts            # Shared createAgentFromConfig() helper
│   ├── app/                           # Main app components (App.tsx, Agent.tsx)
│   ├── commands/                      # Slash commands (/help, /compact, /clear, etc.)
│   ├── components/                    # React components (UserInput, EditDiff, Help, etc.)
│   ├── context/                       # React contexts (AdapterProvider)
│   ├── hooks/                         # Shared hooks (useAgentChat, useConfig, useAgent, etc.)
│   ├── layout/                        # Layout components (Header, Footer, Content)
│   ├── messages/                      # Message rendering (ToolCallPartView, TextPartView, etc.)
│   ├── types/                         # Attachment types
│   ├── utils/                         # Format utilities, clipboard, file attachment
│   └── index.ts                       # Public API exports
│
├── cli/src/                           # @my-agent/cli — terminal host (thin shell)
│   ├── index.tsx                      # Entry point: arg parsing, CoreEnv registration, render
│   ├── args.ts                        # CLI argument parser (sync, no CoreEnv dependency)
│   └── local-adapter.ts              # LocalAgentAdapter (delegates to createAgentFromConfig)
│
├── node/src/                          # @my-agent/node — Node.js CoreEnv implementation
│   ├── index.ts                       # createNodeEnv() factory
│   └── environment/
│       ├── local.ts                   # LocalEnvironmentConfig, mode resolution
│       ├── native-fs.ts              # Workspace-scoped filesystem (path traversal protection)
│       ├── native-run.ts             # Command execution with streaming
│       ├── os-sandbox.ts             # OS sandbox via @anthropic-ai/sandbox-runtime
│       └── shell.ts                   # Shell/PTY management
│
├── server/src/                        # @my-agent/server — CoreEnv HTTP server + client
│   ├── index.ts                       # Hono server entry point
│   ├── client.ts                      # createRemoteCoreEnv() — RPC client factory
│   └── routes/
│       ├── env.ts                     # /api/env/* (info, vars, destroy)
│       ├── fs.ts                      # /api/fs/* (readFile, stat, writeFile, etc.)
│       ├── command.ts                 # /api/command/* (run, exec)
│       ├── fetch.ts                   # /api/fetch/proxy (HTTP proxy with binary support)
│       └── mcp.ts                     # /api/mcp/* (stdio process init, message, delete)
│
├── extension/                         # @my-agent/extension — Chrome extension host
│   ├── adapters/
│   │   └── extension-adapter.ts      # ExtensionAgentAdapter
│   ├── entrypoints/
│   │   ├── sidepanel/                # Main UI (AgentBootstrap → App)
│   │   ├── popup/                    # Settings popup (model, provider, API key)
│   │   └── background.ts            # Service worker
│   ├── components/
│   │   ├── ConnectionGuard.tsx       # Server health check, reconnect logic
│   │   └── ErrorBoundary.tsx
│   └── hooks/
│       └── useServerConfig.ts        # Persistent config via chrome.storage
│
└── mcp-server/src/                    # @my-agent/mcp-server — MCP tool server
    └── index.ts
```

## Runtime Combinations

| Combination | CoreEnv | App Host | Status |
|------------|---------|----------|--------|
| Local CoreEnv + CLI | `createNodeEnv` | Ink terminal | Fully working |
| Remote CoreEnv + CLI | `createRemoteCoreEnv` | Ink terminal | Working (no command streaming) |
| Remote CoreEnv + Extension | `createRemoteCoreEnv` | WXT Chrome extension | Working (no command streaming, no stdio MCP) |
| Local CoreEnv + Extension | N/A | N/A | Not supported (extension requires a server) |

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

1. **ESM Only** — All packages use ESM. Use `.js` extensions in imports.
2. **Workspace Dependencies** — Use `workspace:*` for cross-package deps.
3. **Build Order** — Core → App → rest (`pnpm build` handles this).
4. **Type Exports** — Use `export type` for type-only exports.
5. **CoreEnv is the single source of truth** — `rootPath` comes only from `getEnv().rootPath`, never from config objects. Tools access all platform APIs via `getEnv()`.
6. **No Test Framework** — Currently no tests configured. Use TypeScript compiler for validation.
7. **Adapter pattern** — Both hosts (CLI, extension) implement `AgentAdapter` and delegate shared init logic to `createAgentFromConfig()` in `@my-agent/app`.
