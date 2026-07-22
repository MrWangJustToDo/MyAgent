import { DEFAULT_LOCAL_OPENAI_BASE_URL, buildDefaultSystemPrompt, type ModelStyle } from "@my-agent/core";
import { createState } from "reactivity-store";

import type { AppConfig } from "../adapter/types.js";

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_STYLE: ModelStyle = "openai";
const DEFAULT_MAX_ITERATIONS = 50;

// ============================================================================
// State Hook
// ============================================================================

export const useConfig = createState(
  () => ({
    config: {
      model: "",
      style: DEFAULT_STYLE,
      baseURL: DEFAULT_LOCAL_OPENAI_BASE_URL,
      systemPrompt: "",
      initialPrompt: "",
      maxIterations: DEFAULT_MAX_ITERATIONS,
      debug: false,
      apiKey: "",
      mcpConfigPath: "",
      extensionDirs: [],
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
        state.config.model = config.model || "";
        state.config.style = config.style || DEFAULT_STYLE;
        state.config.baseURL = config.baseURL || DEFAULT_LOCAL_OPENAI_BASE_URL;
        state.config.systemPrompt = config.systemPrompt || (await buildDefaultSystemPrompt());
        state.config.initialPrompt = config.initialPrompt || "";
        state.config.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        state.config.debug = config.debug ?? false;
        state.config.apiKey = config.apiKey || "";
        state.config.mcpConfigPath = config.mcpConfigPath || "";
        state.config.extensionDirs = config.extensionDirs ?? [];
        state.config.continueSession = config.continueSession ?? false;
        state.config.resumeSession = config.resumeSession || "";
        state.config.modelInfo = config.modelInfo;
        state.initialized = true;

        const { model, baseURL, systemPrompt, style } = state.config;
        state.key = `::${style}::${model}::${baseURL}::${systemPrompt}`;
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
        state.config.model = "";
        state.config.style = DEFAULT_STYLE;
        state.config.baseURL = DEFAULT_LOCAL_OPENAI_BASE_URL;
        state.config.systemPrompt = "";
        state.config.initialPrompt = "";
        state.config.maxIterations = DEFAULT_MAX_ITERATIONS;
        state.config.debug = false;
        state.config.apiKey = "";
        state.config.mcpConfigPath = "";
        state.config.extensionDirs = [];
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
