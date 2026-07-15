// Types
export type {
  ModelCapability,
  ModelId,
  ModelInfo,
  ModelOption,
  ModelPricing,
  ModelStyle,
  ReasoningConfig,
} from "./types.js";

// Connection + env resolution (primary entry)
export {
  DEFAULT_BASE_URLS,
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  parseModelStyle,
  resolveModelConfig,
  resolveModelConnection,
  type ModelConnection,
  type ResolveModelConfigInput,
  type ResolvedModelConfig,
} from "./model-config.js";

// models.dev metadata lookup
export {
  fetchModelsDev,
  getModelsByProviderFromModelsDev,
  lookupModelFromModelsDev,
  MODELS_DEV_URL,
} from "./models-dev.js";

// TanStack text adapter (+ provider-specific protocol quirks live here only)
export { createTextAdapter, type TextAdapterConfig, type ModelAdapterConfig } from "./adapter-factory.js";
export {
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  shouldEchoReasoningContent,
} from "./reasoning-echo.js";
export { ReasoningContentCache } from "./reasoning-content-cache.js";
export { resolveReasoningContentForAssistant } from "./resolve-reasoning-content.js";
export {
  createReasoningChatCompletions,
  ReasoningChatCompletionsTextAdapter,
  type ReasoningChatCompletionsConfig,
} from "./reasoning-chat-completions-adapter.js";

export { runSideTextQuery, type SideTextQueryOptions, type SideTextQueryResult } from "./side-text-query.js";

// Optional MODEL_* metadata overrides
export {
  MODEL_ENV_KEYS,
  ModelEnvConfigSchema,
  parseModelEnvConfig,
  parseModelInfoFromEnv,
  resolveModelInfoFromEnv,
  type ModelEnvConfig,
} from "./model-env.js";
