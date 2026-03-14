// Re-export types from schemas (project-specific types)
export type {
  TranslateOptions,
  TranslateResult,
  DetectOptions,
  DetectResult,
  OllamaConfig,
  OllamaModel,
} from "./schemas.js";

// Re-export schemas (project-specific schemas)
export {
  translateOptionsSchema,
  translateResultSchema,
  detectOptionsSchema,
  detectResultSchema,
  ollamaConfigSchema,
  ollamaModelSchema,
  ollamaModelsResponseSchema,
} from "./schemas.js";

// Note: Environment types (Sandbox, SandboxFileSystem, etc.) are exported from './environment'
// Import from there to avoid duplicate exports

// Constants
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_API_URL = `${DEFAULT_OLLAMA_URL}/v1/`;
