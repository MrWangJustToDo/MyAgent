// Agent (main export)
export * from "./agent";

// Environment abstraction
export * from "./environment";

// Managers (class-based state management)
export * from "./managers";

// Provider utilities
export * from "./provider.js";

// Connection adapters for useChat
export * from "./connection.js";

// Types and schemas
export * from "./types.js";

// Re-export zod for schema definitions
export { z } from "zod";

// Re-export commonly used TanStack AI types
export type {
  StreamChunk,
  ChatMiddleware,
  ToolDefinition,
  AnyTextAdapter,
  UIMessage,
  ModelMessage,
} from "@tanstack/ai";

// Re-export message part types for rendering
export type { TextPart, ToolCallPart, ToolResultPart, ThinkingPart, MessagePart } from "@tanstack/ai";
