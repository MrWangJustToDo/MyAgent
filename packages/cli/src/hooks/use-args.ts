import { DEFAULT_OLLAMA_URL, buildDefaultSystemPrompt } from "@my-agent/core";
import { createState } from "reactivity-store";

import { parseArgs, getFlag, getFlagString, getFlagNumber, getFlagBoolean } from "../utils/args.js";

import type { ParsedArgs } from "../utils/args.js";

// ============================================================================
// Types
// ============================================================================

/** Supported LLM providers */
export type Provider = "ollama" | "openRouter" | "openaiCompatible" | "deepseek";

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
  /** Resume the most recent session (--continue flag) */
  continueSession: boolean;
  /** Resume a specific session by ID or name (--resume flag) */
  resumeSession: string;
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
  if (
    value === "ollama" ||
    value === "openrouter" ||
    value === "openai-compatible" ||
    value === "openaicompatible" ||
    value === "deepseek"
  ) {
    if (value === "openrouter") return "openRouter";
    if (value === "openai-compatible" || value === "openaicompatible") return "openaiCompatible";
    if (value === "deepseek") return "deepseek";
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

const DEFAULT_MAX_ITERATIONS = 50;

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
      systemPrompt: buildDefaultSystemPrompt(process.cwd()),
      initialPrompt: "",
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
      provider: DEFAULT_PROVIDER,
      apiKey: "",
      mcpConfigPath: "",
      continueSession: false,
      resumeSession: "",
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
        const envApiKey =
          getEnv("API_KEY") || getEnv("OPENROUTER_API_KEY") || getEnv("DEEPSEEK_API_KEY") || getEnv("apiKey");
        const envMaxIterations = getEnv("MAX_ITERATIONS") || getEnv("maxIterations");

        state.parsed = parsed;

        const sandboxEnv = process.env.SANDBOX_ENV || "local";
        const isRemote = sandboxEnv === "remote";
        const remoteWorkspacePath = process.env.REMOTE_WORKSPACE_PATH?.trim() || "/";

        // CLI args take priority over env vars, which take priority over defaults
        // rootPath: local project directory (SandboxManager key; remote path rewriting)
        state.config.model = getFlagString(parsed, envModel || DEFAULT_MODEL, "model", "m");
        state.config.url = getFlagString(parsed, envUrl || DEFAULT_OLLAMA_URL, "url", "u");
        state.config.rootPath = getFlagString(parsed, process.cwd(), "path", "p");
        const defaultPromptPath = isRemote ? remoteWorkspacePath : state.config.rootPath;
        state.config.systemPrompt = getFlagString(parsed, buildDefaultSystemPrompt(defaultPromptPath), "system", "s");
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
          cliProvider === "openaicompatible" ||
          cliProvider === "deepseek"
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

        // Session resume flags
        state.config.continueSession = getFlagBoolean(parsed, "continue", "c");
        const resumeFlag = getFlag(parsed, "resume", "r");
        if (typeof resumeFlag === "string") {
          state.config.resumeSession = resumeFlag;
        } else if (resumeFlag === true) {
          // --resume without value: show session picker
          state.config.resumeSession = "__picker__";
        }

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
        state.config.systemPrompt = buildDefaultSystemPrompt(process.cwd());
        state.config.initialPrompt = "";
        state.config.maxIterations = DEFAULT_MAX_ITERATIONS;
        state.config.debug = false;
        state.config.provider = DEFAULT_PROVIDER;
        state.config.apiKey = "";
        state.config.mcpConfigPath = "";
        state.config.continueSession = false;
        state.config.resumeSession = "";
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
