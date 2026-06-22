import { createDeepSeek } from "@ai-sdk/deepseek";
// import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { createOllama, ollama } from "ai-sdk-ollama";

import { getEnv } from "../env.js";
import { DEFAULT_OLLAMA_URL } from "../types.js";

import { getModel } from "./registry.js";

import type { ModelId, ModelInfo } from "./types.js";
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

export const createOpenRouterModel = async (modelName: string, apiKey?: string) => {
  const env = getEnv();
  const runEnv = await env.getEnv();
  const resolvedApiKey = apiKey || runEnv.API_KEY || runEnv.OPENROUTER_API_KEY;
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
export const createDeepSeekModel = async (
  modelName: string,
  apiKey?: string,
  baseURL?: string
): Promise<LanguageModel> => {
  const env = getEnv();
  const runEnv = await env.getEnv();
  const resolvedApiKey = apiKey || runEnv.API_KEY || runEnv.DEEPSEEK_API_KEY;
  const deepseek = createDeepSeek({
    apiKey: resolvedApiKey,
    ...(baseURL ? { baseURL } : {}),
  });
  // if (runEnv.NODE_ENV === "production") {
  return deepseek(modelName);
  // }
  // return wrapLanguageModel({ model: deepseek(modelName), middleware: devToolsMiddleware() });
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
export const createModel = async (config: ProviderConfig): Promise<LanguageModel> => {
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

// ============================================================================
// Registry-Aware Model Creation
// ============================================================================

export interface CreateModelFromIdOptions {
  apiKey?: string;
  baseURL?: string;
}

export interface CreateModelFromIdResult {
  model: LanguageModel;
  info: ModelInfo;
}

/**
 * Map ModelProvider (registry) to ProviderType (factory).
 * Models not in this map (e.g. ollama) need special handling.
 */
const providerTypeMap: Record<string, ProviderType> = {
  openai: "openai",
  deepseek: "deepseek",
  "open-router": "open-router",
  anthropic: "open-router",
  google: "open-router",
  xai: "open-router",
};

/**
 * Cloud providers that have their own default API endpoints.
 * baseURL should NOT be forwarded to these unless explicitly intended.
 */
const cloudProviders = new Set<ProviderType>(["openai", "deepseek", "open-router"]);

/**
 * Create a LanguageModel from a registry model ID.
 * Looks up ModelInfo from the registry, maps provider to the correct factory,
 * and returns both the LanguageModel instance and its metadata.
 *
 * For providers without a native SDK (anthropic, google, xai), falls back
 * to OpenRouter which supports them as upstream providers.
 *
 * @example
 * ```typescript
 * const { model, info } = createModelFromId("claude-sonnet-4.6", {
 *   apiKey: "sk-or-...",
 * });
 * agent.setModel(model);
 * agent.setModelInfo(info);
 * ```
 */
export const createModelFromId = async (
  modelId: ModelId,
  options: CreateModelFromIdOptions = {}
): Promise<CreateModelFromIdResult> => {
  const info = getModel(modelId);
  if (!info) {
    throw new Error(`Model "${modelId}" not found in registry. Use createModel() for unregistered models.`);
  }

  const { apiKey, baseURL } = options;
  const providerType = providerTypeMap[info.provider];

  if (!providerType) {
    throw new Error(`No factory mapping for provider "${info.provider}"`);
  }

  // Only forward baseURL to providers that don't have their own default endpoints
  // (e.g. don't send the Ollama default URL to DeepSeek or OpenAI)
  const effectiveBaseURL = baseURL && cloudProviders.has(providerType) ? undefined : baseURL;

  const model = await createModel({
    type: providerType,
    model: info.apiModel,
    apiKey,
    baseURL: effectiveBaseURL,
  });

  return { model, info };
};
