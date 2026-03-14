import { createOllamaChat } from "@tanstack/ai-ollama";

import { DEFAULT_OLLAMA_API_URL } from "./types.js";

import type { AnyTextAdapter } from "@tanstack/ai";
import type { OllamaTextAdapter } from "@tanstack/ai-ollama";

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = "ollama";

export interface ProviderConfig {
  type: ProviderType;
  model: string;
  baseURL?: string;
}

// ============================================================================
// Adapter Creation
// ============================================================================

/**
 * Create an Ollama adapter
 *
 * @example
 * ```typescript
 * const adapter = createOllamaAdapter("llama3");
 * agent.setAdapter(adapter);
 * ```
 */
export const createOllamaAdapter = (
  modelName: string,
  baseURL: string = DEFAULT_OLLAMA_API_URL
): OllamaTextAdapter<string> => {
  return createOllamaChat(modelName, baseURL);
};

/**
 * Create a model adapter from provider config
 *
 * @example
 * ```typescript
 * const adapter = createAdapter({
 *   type: "ollama",
 *   model: "llama3",
 *   baseURL: "http://localhost:11434/api",
 * });
 * ```
 */
export const createAdapter = (config: ProviderConfig): AnyTextAdapter => {
  switch (config.type) {
    case "ollama":
      return createOllamaAdapter(config.model, config.baseURL ?? DEFAULT_OLLAMA_API_URL);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
};

/**
 * @deprecated Use createOllamaAdapter instead
 */
export const createModel = createOllamaAdapter;
