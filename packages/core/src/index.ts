// Agent (main export)
export * from "./agent";

// Base utilities
export { generateId, generateShortId, createSequentialIdGenerator } from "./base/utils.js";

// Environment abstraction
export * from "./environment";

// Managers (class-based state management)
export * from "./managers";

// Provider utilities
export * from "./provider.js";

// Types and schemas
export * from "./types.js";

// Re-export zod for schema definitions
export { z } from "zod";

// Re-export Vercel AI SDK types and classes
export type { LanguageModel, Tool, UIMessage as VercelUIMessage, UIMessageChunk } from "ai";
export { DirectChatTransport, ToolLoopAgent } from "ai";

// waiting issue fix for vercel ai sdk
// https://github.com/vercel/ai/issues/13591
