import { anthropicModels } from "./providers/anthropic.js";
import { deepseekModels } from "./providers/deepseek.js";
import { googleModels } from "./providers/google.js";
import { openaiModels } from "./providers/openai.js";
import { xaiModels } from "./providers/xai.js";

import type { ModelCapability, ModelId, ModelInfo, ModelOption, ModelProvider } from "./types.js";

// ============================================================================
// Global Registry
// ============================================================================

/**
 * All supported models merged into a single registry.
 * Per-provider maps are merged at module load time.
 */
export const modelRegistry: Record<ModelId, ModelInfo> = {
  ...anthropicModels,
  ...openaiModels,
  ...deepseekModels,
  ...googleModels,
  ...xaiModels,
};

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
 * Get a model by its ID. Returns undefined if not found.
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
