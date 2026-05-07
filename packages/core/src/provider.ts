import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { createOllama, ollama } from "ai-sdk-ollama";

import { DEFAULT_OLLAMA_URL } from "./types.js";

import type { LanguageModel, ToolSet } from "ai";

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = "ollama" | "openai" | "openai-compatible" | "open-router" | "deepseek";

export interface OllamaModelOptions {
  /** Enable reasoning/thinking extraction for models like qwen3, deepseek-r1 */
  reasoning?: boolean;
  /** Tag name for reasoning extraction (default: "think") */
  reasoningTagName?: string;
}

export interface ProviderConfig {
  type: ProviderType;
  model: string;
  baseURL?: string;
  apiKey?: string;
  /** Ollama-specific options */
  ollamaOptions?: OllamaModelOptions;
}

// ============================================================================
// Model Creation
// ============================================================================

/**
 * Create an Ollama model using the native ai-sdk-ollama provider
 *
 * Supports native Ollama features including:
 * - Thinking/reasoning extraction for models like qwen3, deepseek-r1
 * - Native Ollama API (not OpenAI-compatible endpoint)
 * - Advanced Ollama options (mirostat, repeat_penalty, num_ctx, etc.)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const model = createOllamaModel("llama3");
 *
 * // With reasoning enabled (for qwen3, deepseek-r1, etc.)
 * const model = createOllamaModel("qwen3", "http://localhost:11434", {
 *   reasoning: true,
 * });
 *
 * agent.setModel(model);
 * ```
 */
export const createOllamaModel = (
  modelName: string,
  baseURL: string = DEFAULT_OLLAMA_URL,
  options: OllamaModelOptions = {}
): LanguageModel => {
  const { reasoning = true, reasoningTagName = "think" } = options;

  // Create Ollama provider with native API
  const ollama = createOllama({
    baseURL: baseURL.replace(/\/+$/, ""), // Remove trailing slashes
  });

  // Create the base model
  const baseModel = ollama(modelName, { think: reasoning });

  // If reasoning is enabled, wrap with extractReasoningMiddleware
  if (reasoning) {
    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({
        tagName: reasoningTagName,
        separator: "\n",
        // startWithReasoning: false - only extract content within <think> tags
        // Don't assume the model always starts with reasoning
        startWithReasoning: false,
      }),
    });
  }

  return baseModel;
};

export const getOllamaBuildInTools = (genTools: (pkg: typeof ollama) => ToolSet) => {
  return genTools(ollama);
};

/**
 * Create an OpenAI model
 *
 * @example
 * ```typescript
 * const model = createOpenAIModel("gpt-4o", "your-api-key");
 * agent.setModel(model);
 * ```
 */
export const createOpenAIModel = (modelName: string, apiKey: string, baseURL?: string): LanguageModel => {
  const openai = createOpenAI({
    apiKey,
    baseURL,
  });
  return openai(modelName);
};

/**
 * Create an OpenAI-compatible model (for LMStudio, vLLM, etc.)
 *
 * @example
 * ```typescript
 * // Use LMStudio with OpenAI-compatible endpoint
 * const model = createOpenAICompatibleModel("local-model", "http://localhost:1234/v1");
 * agent.setModel(model);
 * ```
 */
export const createOpenAICompatibleModel = (
  modelName: string,
  baseURL: string,
  apiKey: string = "not-needed"
): LanguageModel => {
  const provider = createOpenAI({
    baseURL,
    apiKey,
  });
  // Use .chat() to explicitly use the Chat API instead of the Responses API
  // The Responses API is not supported by most OpenAI-compatible providers
  return provider.chat(modelName);
};

export const createOpenRouterModel = (modelName: string, apiKey?: string) => {
  const resolvedApiKey = apiKey || process.env.API_KEY || process.env.OPENROUTER_API_KEY;
  const provider = createOpenRouter({ apiKey: resolvedApiKey });

  return provider(modelName, {
    reasoning: { enabled: true, effort: "medium" },
    usage: { include: true },
  }) as LanguageModel;
};

/**
 * Create a DeepSeek model
 *
 * @example
 * ```typescript
 * const model = createDeepSeekModel("deepseek-chat", "your-api-key");
 * agent.setModel(model);
 *
 * // With reasoning (deepseek-reasoner)
 * const model = createDeepSeekModel("deepseek-reasoner", "your-api-key");
 * ```
 */
export const createDeepSeekModel = (modelName: string, apiKey?: string, baseURL?: string): LanguageModel => {
  const resolvedApiKey = apiKey || process.env.API_KEY || process.env.DEEPSEEK_API_KEY;
  const deepseek = createDeepSeek({
    apiKey: resolvedApiKey,
    ...(baseURL ? { baseURL } : {}),
  });
  return deepseek(modelName);
};

/**
 * Create a model from provider config
 *
 * @example
 * ```typescript
 * // Using Ollama
 * const model = createModel({
 *   type: "ollama",
 *   model: "llama3",
 *   baseURL: "http://localhost:11434",
 * });
 *
 * // Using Ollama with reasoning (qwen3, deepseek-r1)
 * const model = createModel({
 *   type: "ollama",
 *   model: "qwen3",
 *   ollamaOptions: { reasoning: true },
 * });
 *
 * // Using OpenAI
 * const model = createModel({
 *   type: "openai",
 *   model: "gpt-4o",
 *   apiKey: "sk-...",
 * });
 * ```
 */
export const createModel = (config: ProviderConfig): LanguageModel => {
  switch (config.type) {
    case "ollama":
      return createOllamaModel(config.model, config.baseURL ?? DEFAULT_OLLAMA_URL, config.ollamaOptions);
    case "openai":
      if (!config.apiKey) {
        throw new Error("OpenAI provider requires an API key");
      }
      return createOpenAIModel(config.model, config.apiKey, config.baseURL);
    case "openai-compatible":
      return createOpenAICompatibleModel(config.model, config.baseURL ?? DEFAULT_OLLAMA_URL, config.apiKey);
    case "open-router":
      return createOpenRouterModel(config.model);
    case "deepseek":
      return createDeepSeekModel(config.model, config.apiKey, config.baseURL);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
};
