import { DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { createState } from "reactivity-store";

import { parseArgs, getFlagString, getFlagNumber, getFlagBoolean } from "../utils/args.js";

import type { ParsedArgs } from "../utils/args.js";

// ============================================================================
// Types
// ============================================================================

/**
 * CLI-specific agent configuration
 * (Different from core's AgentConfig - includes CLI-specific fields)
 */
export interface CliAgentConfig {
  /** Model name (e.g., "qwen2.5-coder:7b") */
  model: string;
  /** API URL (e.g., "http://localhost:11434") */
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

  provider: "ollama" | "openRouter";
}

/** @deprecated Use CliAgentConfig instead */
export type AgentConfig = CliAgentConfig;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_SYSTEM_PROMPT = `You are a helpful coding agent.
Use the todo tool to plan multi-step tasks. Mark in_progress before starting, completed when done.
Prefer tools over prose.`;
// "You are a helpful coding assistant. You can read, write, and modify files, run commands, and help with programming tasks.";

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
    /** Resolved configuration */
    config: {
      model: DEFAULT_MODEL,
      url: DEFAULT_OLLAMA_URL,
      rootPath: process.cwd(),
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      initialPrompt: "",
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
    } as AgentConfig,
    /** Whether args have been initialized */
    initialized: false,
    /** Whether help was requested */
    helpRequested: false,

    key: "",
  }),
  {
    withActions: (state) => ({
      /**
       * Initialize with command line arguments
       */
      init: (args: string[]) => {
        const parsed = parseArgs(args);

        state.parsed = parsed;
        state.config.model = getFlagString(parsed, DEFAULT_MODEL, "model", "m");
        state.config.url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");
        state.config.rootPath = getFlagString(parsed, process.cwd(), "path", "p");
        state.config.systemPrompt = getFlagString(parsed, DEFAULT_SYSTEM_PROMPT, "system", "s");
        state.config.initialPrompt = parsed.positional.join(" ");
        state.config.maxIterations = getFlagNumber(parsed, DEFAULT_MAX_ITERATIONS, "max-iterations");
        state.config.debug = getFlagBoolean(parsed, "debug", "d");
        state.helpRequested = getFlagBoolean(parsed, "help", "h");
        state.initialized = true;
      },

      getKey: () => {
        const { model, url, rootPath, systemPrompt } = state.config;

        state.key = `::${model}::${url}::${rootPath}::${systemPrompt}`;
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
