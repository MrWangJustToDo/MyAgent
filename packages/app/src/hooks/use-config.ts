import { DEFAULT_OLLAMA_URL, buildDefaultSystemPrompt } from "@my-agent/core";
import { createState } from "reactivity-store";

import type { AppConfig, Provider } from "../adapter/types.js";

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_PROVIDER: Provider = "ollama";
const DEFAULT_MAX_ITERATIONS = 50;

// ============================================================================
// State Hook
// ============================================================================

export const useConfig = createState(
  () => ({
    config: {
      model: DEFAULT_MODEL,
      url: DEFAULT_OLLAMA_URL,
      systemPrompt: "",
      initialPrompt: "",
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
      provider: DEFAULT_PROVIDER,
      apiKey: "",
      mcpConfigPath: "",
      continueSession: false,
      resumeSession: "",
    } as AppConfig,
    initialized: false,
    helpRequested: false,
    key: "",
  }),
  {
    withActions: (state) => ({
      init: async (config: Partial<AppConfig>) => {
        state.config.model = config.model || DEFAULT_MODEL;
        state.config.url = config.url || DEFAULT_OLLAMA_URL;
        state.config.systemPrompt = config.systemPrompt || (await buildDefaultSystemPrompt());
        state.config.initialPrompt = config.initialPrompt || "";
        state.config.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        state.config.debug = config.debug ?? false;
        state.config.provider = config.provider || DEFAULT_PROVIDER;
        state.config.apiKey = config.apiKey || "";
        state.config.mcpConfigPath = config.mcpConfigPath || "";
        state.config.continueSession = config.continueSession ?? false;
        state.config.resumeSession = config.resumeSession || "";
        state.initialized = true;

        const { model, url, systemPrompt, provider } = state.config;
        state.key = `::${provider}::${model}::${url}::${systemPrompt}`;
      },

      setHelpRequested: (help: boolean) => {
        state.helpRequested = help;
      },

      setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
        state.config[key] = value;
      },

      updateConfig: (updates: Partial<AppConfig>) => {
        Object.assign(state.config, updates);
      },

      reset: () => {
        state.config.model = DEFAULT_MODEL;
        state.config.url = DEFAULT_OLLAMA_URL;
        state.config.systemPrompt = "";
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
    withNamespace: "useConfig",
  }
);

export const initConfig = async (config: Partial<AppConfig>): Promise<void> => {
  await useConfig.getActions().init(config);
};
