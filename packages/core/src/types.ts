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

// Re-export AI SDK types that are commonly used
export type {
  LanguageModel,
  ToolSet,
  Tool,
  GenerateTextResult,
  StreamTextResult,
  LanguageModelUsage,
  FinishReason,
  ModelMessage,
  SystemModelMessage,
  UserModelMessage,
  AssistantModelMessage,
} from "ai";

// Re-export AI SDK schemas
export { modelMessageSchema, systemModelMessageSchema, userModelMessageSchema, assistantModelMessageSchema } from "ai";

// Constants
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_API_URL = `${DEFAULT_OLLAMA_URL}/v1/`;
