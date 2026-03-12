import { DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export interface AgentConfig {
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
  /** Maximum steps per run */
  maxSteps: number;
}

// ============================================================================
// Argument Parsing Utilities
// ============================================================================

/**
 * Parse command line arguments into structured format
 *
 * Supports:
 * - Long flags: --model gpt-4
 * - Short flags: -m gpt-4
 * - Boolean flags: --help, -h
 * - Positional args: "hello world"
 */
export const parseArgs = (args: string[]): ParsedArgs => {
  const result: ParsedArgs = {
    positional: [],
    flags: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      // Long flag: --model value or --help
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flag: -m value or -h
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else {
      // Positional argument
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
};

/**
 * Get a flag value by multiple possible keys
 */
export const getFlag = (args: ParsedArgs, ...keys: string[]): string | boolean | undefined => {
  for (const key of keys) {
    if (args.flags[key] !== undefined) {
      return args.flags[key];
    }
  }
  return undefined;
};

/**
 * Get a flag value as string with default
 */
export const getFlagString = (args: ParsedArgs, defaultValue: string, ...keys: string[]): string => {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    return value;
  }
  return defaultValue;
};

/**
 * Get a flag value as number with default
 */
export const getFlagNumber = (args: ParsedArgs, defaultValue: number, ...keys: string[]): number => {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
};

/**
 * Get a flag value as boolean
 */
export const getFlagBoolean = (args: ParsedArgs, ...keys: string[]): boolean => {
  const value = getFlag(args, ...keys);
  return value === true || value === "true";
};

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful coding assistant. You can read, write, and modify files, run commands, and help with programming tasks.";
const DEFAULT_MAX_STEPS = 20;

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
      maxSteps: DEFAULT_MAX_STEPS,
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
        state.config.maxSteps = getFlagNumber(parsed, DEFAULT_MAX_STEPS, "max-steps");
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
        state.config.maxSteps = DEFAULT_MAX_STEPS;
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
