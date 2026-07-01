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

// models.dev API — fetches up-to-date model metadata from https://models.dev
export {
  fetchModelsDev,
  getModelsByProviderFromModelsDev,
  lookupModelFromModelsDev,
  MODELS_DEV_URL,
} from "./models-dev.js";

// Global registry and helpers (runtime-populated)
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
