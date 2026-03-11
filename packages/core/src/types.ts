// Re-export types from schemas (project-specific types)
// Sandbox types for just-bash provider
import type { JustBashSandbox } from "@computesdk/just-bash";
import type { ProviderSandbox } from "@computesdk/provider";

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

// Re-export schemas (project-specific schemas)
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

/**
 * Sandbox type for the local just-bash provider.
 * Uses the standard SandboxInterface with JustBashSandbox internals.
 */
export type Sandbox = ProviderSandbox<JustBashSandbox>;

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
