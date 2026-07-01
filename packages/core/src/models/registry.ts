import type { ModelCapability, ModelId, ModelInfo, ModelOption, ModelProvider } from "./types.js";

// ============================================================================
// Global Registry (runtime-populated)
// ============================================================================

/**
 * Runtime model registry. Starts empty — models are registered at runtime
 * via {@link registerModel} / {@link registerModels}, or resolved on-demand
 * from the models.dev API (see `models-dev.ts`).
 *
 * Hardcoded provider files were removed in favor of fetching up-to-date
 * metadata from https://models.dev/api.json.
 */
export const modelRegistry: Record<ModelId, ModelInfo> = {};

/**
 * Provider display order for UI model pickers (lower = higher priority).
 */
export const providerPriority: Record<ModelProvider, number> = {
  anthropic: 1,
  openai: 2,
  google: 3,
  deepseek: 4,
  "open-router": 5,
  xai: 6,
  ollama: 7,
};

// ============================================================================
// Lookup Helpers
// ============================================================================

/**
 * Get a model by its ID from the runtime registry.
 *
 * Note: This only checks the runtime registry. For full model resolution
 * (including models.dev lookup), use `createModelFromId` from `factory.ts`.
 */
export function getModel(id: ModelId): ModelInfo | undefined {
  return modelRegistry[id];
}

/**
 * Get all models for a specific provider.
 */
export function getModelsByProvider(provider: ModelProvider): ModelInfo[] {
  return Object.values(modelRegistry).filter((m) => m.provider === provider);
}

/**
 * Get all models that have a specific capability.
 */
export function getModelsByCapability(capability: ModelCapability): ModelInfo[] {
  return Object.values(modelRegistry).filter((m) => m.capabilities.includes(capability));
}

/**
 * Get the default model for a provider (the one with `isDefault: true`).
 * Falls back to the first model if none is marked as default.
 */
export function getDefaultModel(provider: ModelProvider): ModelInfo | undefined {
  const models = getModelsByProvider(provider);
  return models.find((m) => m.isDefault) ?? models[0];
}

/**
 * Get all models as lightweight options for UI display,
 * sorted by provider priority then by name.
 */
export function getModelOptions(): ModelOption[] {
  return Object.values(modelRegistry)
    .sort((a, b) => {
      const pa = providerPriority[a.provider] ?? 99;
      const pb = providerPriority[b.provider] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    })
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
    }));
}

/**
 * Check if a model supports a specific capability.
 */
export function modelHasCapability(id: ModelId, capability: ModelCapability): boolean {
  const model = modelRegistry[id];
  return model ? model.capabilities.includes(capability) : false;
}

/**
 * Get all unique provider names from the registry.
 */
export function getAvailableProviders(): ModelProvider[] {
  const providers = new Set<ModelProvider>();
  for (const model of Object.values(modelRegistry)) {
    providers.add(model.provider);
  }
  return [...providers].sort((a, b) => (providerPriority[a] ?? 99) - (providerPriority[b] ?? 99));
}

/**
 * Register a custom model at runtime (e.g. dynamically discovered Ollama models).
 */
export function registerModel(model: ModelInfo): void {
  modelRegistry[model.id] = model;
}

/**
 * Register multiple custom models at runtime.
 */
export function registerModels(models: ModelInfo[]): void {
  for (const model of models) {
    modelRegistry[model.id] = model;
  }
}
