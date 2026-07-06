// Core Environment API (must be registered before using any core functionality)
export {
  registerCoreEnv,
  clearCoreEnv,
  getEnv,
  hasCoreEnv,
  defaultPath,
  defaultByteLength,
  defaultBase64Encode,
  defaultBase64Decode,
  type CoreEnv,
  type ResolvedCoreEnv,
  type CoreEnvPath,
  type CoreEnvFs,
  type CoreEnvFsStat,
  type CoreEnvExecOptions,
  type CoreEnvExecResult,
  type McpStdioTransportConfig,
  type McpProcessHandle,
} from "./env.js";

// Agent (main export)
export * from "./agent";

// Base utilities
export { generateId, generateShortId, createSequentialIdGenerator } from "./agent/utils.js";

// Streaming callback for real-time tool output
export {
  setStreamingCallback,
  setStreamingClearCallback,
  getStreamingCallback,
  emitStreamingChunk,
  clearStreamingOutput,
  type StreamingChunk,
  type StreamingCallback,
  type StreamingClearCallback,
} from "./agent/tools/util/streaming-callback.js";

// Environment abstraction (types only — implementations provided externally via CoreEnv)
export * from "./environment";

// Managers (class-based state management)
export * from "./managers";

// Model registry, config, and factory
export * from "./models";

// Types and schemas
export * from "./types.js";

// Re-export zod for schema definitions
export { z } from "zod";

// Re-export Vercel AI SDK types and classes
export type { LanguageModel, Tool, UIMessage as VercelUIMessage, UIMessageChunk } from "ai";
export { DirectChatTransport, ToolLoopAgent } from "ai";

// waiting issue fix for vercel ai sdk
// https://github.com/vercel/ai/issues/13591
