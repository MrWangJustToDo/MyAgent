import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { DEFAULT_OLLAMA_API_URL } from "./types.js";

import type { LanguageModel } from "ai";

/**
 * Create an OpenAI-compatible provider for a given base URL
 * This is used to connect to Ollama or other OpenAI-compatible APIs
 */
export const createProvider = (baseURL: string = DEFAULT_OLLAMA_API_URL) => {
  return createOpenAICompatible({
    name: "openai-compatible",
    baseURL,
    // Include usage information in streaming responses
    // This adds stream_options: { include_usage: true } to requests
    includeUsage: true,
  });
};

/**
 * Create a model instance from a provider
 */
export const createModel = (modelName: string, baseURL: string = DEFAULT_OLLAMA_API_URL): LanguageModel => {
  const provider = createProvider(baseURL);
  return provider(modelName);
};
