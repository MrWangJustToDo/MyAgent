// Re-export types from schemas
export type {
  TranslateOptions,
  TranslateResult,
  DetectOptions,
  DetectResult,
  OllamaConfig,
  OllamaModel,
  ChatMessage,
  ChatOptions,
  ChatResult,
} from "./schemas.js";

// Re-export schemas
export {
  translateOptionsSchema,
  translateResultSchema,
  detectOptionsSchema,
  detectResultSchema,
  ollamaConfigSchema,
  ollamaModelSchema,
  ollamaModelsResponseSchema,
  chatMessageSchema,
  chatOptionsSchema,
  chatResultSchema,
} from "./schemas.js";

// Constants
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_API_URL = `${DEFAULT_OLLAMA_URL}/v1/`;
