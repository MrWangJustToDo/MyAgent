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

/**
 * Re-export Sandbox type from environment module.
 * This is the unified sandbox interface that all tools use.
 *
 * For environment-specific features, import directly from './environment'.
 */
export type {
  Sandbox,
  SandboxFileSystem,
  SandboxConfig,
  Environment,
  EnvironmentType,
  FileEntry,
  CommandResult,
  RunCommandOptions,
} from "./environment/types.js";

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
