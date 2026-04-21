import { DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { createState } from "reactivity-store";

import { parseArgs, getFlagString, getFlagNumber, getFlagBoolean } from "../utils/args.js";

import type { ParsedArgs } from "../utils/args.js";

// ============================================================================
// Types
// ============================================================================

/** Supported LLM providers */
export type Provider = "ollama" | "openRouter" | "openaiCompatible";

/**
 * CLI-specific agent configuration
 * (Different from core's AgentConfig - includes CLI-specific fields)
 */
export interface CliAgentConfig {
  /** Model name (e.g., "qwen2.5-coder:7b", "anthropic/claude-3.5-sonnet") */
  model: string;
  /** API URL for Ollama (default: http://localhost:11434) */
  url: string;
  /** Working directory path */
  rootPath: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Initial prompt from command line */
  initialPrompt: string;
  /** Maximum iterations per run */
  maxIterations: number;
  /** Enable debug logging */
  debug: boolean;
  /** LLM provider: "ollama", "openRouter", or "openaiCompatible" */
  provider: Provider;
  /** API key for OpenRouter (required when provider is "openRouter") */
  apiKey: string;
  /** Path to MCP config file (relative to rootPath). Defaults to ".opencode/mcp.json" */
  mcpConfigPath: string;
}

// ============================================================================
// Environment Variable Helpers
// ============================================================================

/**
 * Get environment variable value with fallback
 */
const getEnv = (key: string, fallback: string = ""): string => {
  return process.env[key] ?? fallback;
};

/**
 * Get environment variable as Provider type
 */
const getEnvProvider = (key: string, fallback: Provider = "ollama"): Provider => {
  const value = process.env[key]?.toLowerCase();
  if (value === "ollama" || value === "openrouter" || value === "openai-compatible" || value === "openaicompatible") {
    if (value === "openrouter") return "openRouter";
    if (value === "openai-compatible" || value === "openaicompatible") return "openaiCompatible";
    return "ollama";
  }
  return fallback;
};

/** @deprecated Use CliAgentConfig instead */
export type AgentConfig = CliAgentConfig;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_PROVIDER: Provider = "ollama";
const DEFAULT_SYSTEM_PROMPT = `You are an elite AI software engineer specializing in writing high-quality, maintainable code. Your expertise lies in understanding complex requirements, architecting robust solutions, and implementing them with precision and care.

**Core Principles**:
- Write clean, readable, and well-documented code
- Follow established design patterns and best practices
- Prioritize correctness, performance, and maintainability
- Test your implementations thoroughly
- Seek clarification when requirements are ambiguous

**Tool Usage Guidelines**:

1. **Task Planning (todo tool)**:
   - Always use the todo tool to plan multi-step tasks before starting implementation
   - Mark tasks as in_progress before beginning work on them
   - Mark tasks as completed immediately when done
   - Update the todo list frequently to reflect current progress
   - Keep only ONE task in_progress at a time to maintain focus
   - Include a concise title for the current todo set

2. **File Operations**:
   - Use read_file to examine existing code before making changes
   - Use write_file for creating new files
   - Use edit_file or search_replace for modifying existing files (prefer search_replace for small changes)
   - Use tree, list_file, glob, and grep to navigate and understand the codebase structure

3. **Code Execution & Testing**:
   - Use run_command to execute tests, build commands, or run the code
   - Verify your changes work correctly before marking tasks complete
   - Check command outputs for errors and address them promptly

4. **Research & Discovery**:
   - Use task tool to spawn subagents for exploring the codebase or researching specific topics
   - Use man_command and list_command to discover available commands and their options
   - Use webfetch to retrieve external documentation or web resources (returns markdown by default)

5. **Skills System**:
   - Use list_skills to discover available specialized knowledge
   - Use load_skill to load domain-specific instructions relevant to your current task

**Workflow Pattern**:

1. Understand the request fully - ask clarifying questions if needed
2. Create a todo list breaking down the work into logical steps
3. Research existing code patterns in the project (read relevant files)
4. Implement each step, marking todos appropriately
5. Test your implementation using run_command
6. Review your work for quality and correctness
7. Mark all todos as completed when finished

**Quality Control**:

- Before completing any task, verify:
  - The code compiles/builds without errors
  - Tests pass if applicable
  - The implementation follows project conventions
  - Edge cases are handled appropriately
  - Error messages are informative

**Error Handling**:

- If a command fails, analyze the error output carefully
- Use man_command to look up command documentation if unsure
- Retry with corrected parameters or seek alternative approaches
- Report failures clearly to the user with context

**Communication Style**:

- Be concise and direct in explanations
- Show code and command outputs when relevant
- Explain your reasoning for key decisions
- Proactively suggest improvements or next steps
- Prefer demonstrating through tools rather than lengthy explanations

**Important**: You are an autonomous expert capable of handling tasks with minimal guidance. Your system prompt is your complete operational manual - use it to guide every decision.`;

const DEFAULT_MAX_ITERATIONS = 20;

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global args state hook (zustand-like API from reactivity-store)
 *
 * @example
 * ```tsx
 * // Initialize at startup
 * useArgs.getActions().init(process.argv.slice(2));
 *
 * // Use in components (reactive) - like zustand
 * const { config, initialized } = useArgs();
 *
 * // Select specific state (reactive, optimized re-renders)
 * const model = useArgs((s) => s.config.model);
 * const { model, url } = useArgs((s) => ({ model: s.config.model, url: s.config.url }));
 *
 * // Use deep selector for nested objects
 * const config = useArgs.useDeepSelector((s) => s.config);
 *
 * // Get actions (non-reactive, can call anywhere)
 * const { init, setConfig } = useArgs.getActions();
 *
 * // Get reactive state directly (for mutations outside components)
 * const state = useArgs.getReactiveState();
 * state.config.model = "new-model";
 * ```
 */
export const useArgs = createState(
  () => ({
    /** Raw parsed arguments */
    parsed: { positional: [], flags: {} } as ParsedArgs,
    /** Resolved configuration (priority: CLI args > env vars > defaults) */
    config: {
      model: DEFAULT_MODEL,
      url: DEFAULT_OLLAMA_URL,
      rootPath: process.cwd(),
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      initialPrompt: "",
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
      provider: DEFAULT_PROVIDER,
      apiKey: "",
      mcpConfigPath: "",
    } as CliAgentConfig,
    /** Whether args have been initialized */
    initialized: false,
    /** Whether help was requested */
    helpRequested: false,

    key: "",
  }),
  {
    withActions: (state) => ({
      /**
       * Initialize with command line arguments.
       * Priority: CLI args > environment variables > defaults
       */
      init: (args: string[]) => {
        const parsed = parseArgs(args);

        // Get env vars (loaded by dotenv in index.tsx)
        const envModel = getEnv("MODEL") || getEnv("model");
        const envUrl = getEnv("URL") || getEnv("OLLAMA_URL") || getEnv("OPENAI_COMPATIBLE_URL") || getEnv("url");
        const envProvider = getEnvProvider("PROVIDER") || getEnvProvider("provider");
        const envApiKey = getEnv("API_KEY") || getEnv("OPENROUTER_API_KEY") || getEnv("apiKey");
        const envMaxIterations = getEnv("MAX_ITERATIONS") || getEnv("maxIterations");

        state.parsed = parsed;

        // CLI args take priority over env vars, which take priority over defaults
        state.config.model = getFlagString(parsed, envModel || DEFAULT_MODEL, "model", "m");
        state.config.url = getFlagString(parsed, envUrl || DEFAULT_OLLAMA_URL, "url", "u");
        state.config.rootPath = getFlagString(parsed, process.cwd(), "path", "p");
        state.config.systemPrompt = getFlagString(parsed, DEFAULT_SYSTEM_PROMPT, "system", "s");
        state.config.initialPrompt = parsed.positional.join(" ");

        // Parse max iterations from env or CLI
        const envMaxIter = envMaxIterations ? parseInt(envMaxIterations, 10) : DEFAULT_MAX_ITERATIONS;
        state.config.maxIterations = getFlagNumber(
          parsed,
          isNaN(envMaxIter) ? DEFAULT_MAX_ITERATIONS : envMaxIter,
          "max-iterations"
        );

        state.config.debug = getFlagBoolean(parsed, "debug", "d");

        // Provider: CLI --provider flag > env var > default
        const cliProvider = getFlagString(parsed, "", "provider");
        if (
          cliProvider === "ollama" ||
          cliProvider === "openRouter" ||
          cliProvider === "openrouter" ||
          cliProvider === "openai-compatible" ||
          cliProvider === "openaicompatible"
        ) {
          if (cliProvider === "openrouter") {
            state.config.provider = "openRouter";
          } else if (cliProvider === "openai-compatible" || cliProvider === "openaicompatible") {
            state.config.provider = "openaiCompatible";
          } else {
            state.config.provider = cliProvider as Provider;
          }
        } else {
          state.config.provider = envProvider;
        }

        // API key: CLI --api-key flag > env var
        state.config.apiKey = getFlagString(parsed, envApiKey, "api-key", "k");

        // MCP config path: CLI --mcp-config flag > env var > empty (uses default)
        const envMcpConfig = getEnv("MCP_CONFIG_PATH");
        state.config.mcpConfigPath = getFlagString(parsed, envMcpConfig, "mcp-config");

        state.helpRequested = getFlagBoolean(parsed, "help", "h");
        state.initialized = true;
      },

      getKey: () => {
        const { model, url, rootPath, systemPrompt, provider } = state.config;

        state.key = `::${provider}::${model}::${url}::${rootPath}::${systemPrompt}`;
      },

      /**
       * Update a specific config value
       */
      setConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
        state.config[key] = value;
      },

      /**
       * Update multiple config values
       */
      updateConfig: (updates: Partial<AgentConfig>) => {
        Object.assign(state.config, updates);
      },

      /**
       * Reset to defaults
       */
      reset: () => {
        state.parsed = { positional: [], flags: {} };
        state.config.model = DEFAULT_MODEL;
        state.config.url = DEFAULT_OLLAMA_URL;
        state.config.rootPath = process.cwd();
        state.config.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        state.config.initialPrompt = "";
        state.config.maxIterations = DEFAULT_MAX_ITERATIONS;
        state.config.debug = false;
        state.config.provider = DEFAULT_PROVIDER;
        state.config.apiKey = "";
        state.config.mcpConfigPath = "";
        state.helpRequested = false;
        state.initialized = false;
        state.key = "";
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,

    withNamespace: "useArgs",
  }
);

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Initialize args (call once at startup)
 */
export const initArgs = (args: string[]): void => {
  useArgs.getActions().init(args);
  useArgs.getActions().getKey();
};

// Re-export types and utilities from utils/args
export type { ParsedArgs };
export { parseArgs, getFlag, getFlagString, getFlagNumber, getFlagBoolean } from "../utils/args.js";
