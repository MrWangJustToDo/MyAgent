// Types
export type {
  ModelCapability,
  ModelId,
  ModelInfo,
  ModelOption,
  ModelPricing,
  ModelProvider,
  ReasoningConfig,
} from "./types.js";

// Per-provider model maps
export { anthropicModels } from "./providers/anthropic.js";
export { deepseekModels } from "./providers/deepseek.js";
export { googleModels } from "./providers/google.js";
export { openaiModels } from "./providers/openai.js";
export { xaiModels } from "./providers/xai.js";

// Global registry and helpers
export {
  getAvailableProviders,
  getDefaultModel,
  getModel,
  getModelOptions,
  getModelsByCapability,
  getModelsByProvider,
  modelHasCapability,
  modelRegistry,
  providerPriority,
  registerModel,
  registerModels,
} from "./registry.js";

// Model factory (create LanguageModel instances from config or registry ID)
export {
  createModel,
  createModelFromId,
  createOllamaModel,
  createOpenAIModel,
  createOpenAICompatibleModel,
  createOpenRouterModel,
  createDeepSeekModel,
  getOllamaBuildInTools,
  type ProviderType,
  type ProviderConfig,
  type OllamaModelOptions,
  type CreateModelFromIdOptions,
  type CreateModelFromIdResult,
} from "./factory.js";

// Env-driven model metadata (MODEL_* env vars → ModelInfo override)
export {
  MODEL_ENV_KEYS,
  ModelEnvConfigSchema,
  parseModelEnvConfig,
  parseModelInfoFromEnv,
  resolveModelInfoFromEnv,
  type ModelEnvConfig,
} from "./model-env.js";
