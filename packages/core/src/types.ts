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

// ============================================================================
// UI Message Types (compatible with Vercel AI SDK)
// ============================================================================

/**
 * Approval state for tool calls that require user confirmation
 */
export type ApprovalState =
  | { status: "pending"; id: string }
  | { status: "approved"; id: string }
  | { status: "rejected"; id: string; reason?: string };

/**
 * Text part of a message
 */
export interface TextPart {
  type: "text";
  /** The text content */
  text: string;
  /** Content alias for compatibility */
  content?: string;
  /** State of the text part */
  state?: "streaming" | "done";
}

/**
 * Thinking/reasoning part of a message
 */
export interface ThinkingPart {
  type: "thinking";
  /** The thinking/reasoning text */
  text: string;
  /** Content alias for compatibility */
  content?: string;
  /** State of the thinking part */
  state?: "streaming" | "done";
}

/**
 * Tool call state
 */
export type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-pending"
  | "approval-approved"
  | "approval-rejected";

/**
 * Tool call part of a message
 */
export interface ToolCallPart {
  type: "tool-call";
  /** Unique ID for this tool call */
  id: string;
  /** Alias for id (toolCallId) */
  toolCallId?: string;
  /** Name of the tool being called */
  toolName: string;
  /** Tool alias for name */
  name?: string;
  /** Tool input arguments */
  input: unknown;
  /** Arguments alias for input */
  arguments?: unknown;
  /** Current state of the tool call */
  state: ToolCallState;
  /** Approval state if tool requires approval */
  approval?: ApprovalState;
}

/**
 * Tool result part of a message
 */
export interface ToolResultPart {
  type: "tool-result";
  /** ID of the tool call this result is for */
  toolCallId: string;
  /** Name of the tool */
  toolName: string;
  /** Tool alias for name */
  name?: string;
  /** The result output */
  output: unknown;
  /** Result alias for output */
  result?: unknown;
  /** Error text if the tool failed */
  errorText?: string;
  /** Whether there was an error */
  isError?: boolean;
}

/**
 * File part of a message
 */
export interface FilePart {
  type: "file";
  /** IANA media type */
  mediaType: string;
  /** File URL or data URL */
  url: string;
  /** Optional filename */
  filename?: string;
}

/**
 * Step start marker
 */
export interface StepStartPart {
  type: "step-start";
}

/**
 * Union of all message part types
 */
export type MessagePart = TextPart | ThinkingPart | ToolCallPart | ToolResultPart | FilePart | StepStartPart;

/**
 * UI Message structure (compatible with Vercel AI SDK UIMessage)
 */
export interface UIMessage {
  /** Unique message ID */
  id: string;
  /** Role of the message sender */
  role: "system" | "user" | "assistant";
  /** Message parts for rendering */
  parts: MessagePart[];
  /** Optional metadata */
  metadata?: unknown;
  /** Content string (for simple text messages) */
  content?: string;
  /** Created timestamp */
  createdAt?: Date;
}

/**
 * Model message for API communication
 */
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessagePart[];
}
