// ============================================================================
// Token Usage
// ============================================================================

/** Token usage statistics */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// Tool Types
// ============================================================================

export type ToolStatus = "pending" | "running" | "success" | "error" | "need-approve" | "rejected";

/** Tool call within an assistant message */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

// /** Tool approval response */
// export interface ToolApprovalResponse {
//   toolCallId: string;
//   approved: boolean;
//   reason?: string;
// }

// ============================================================================
// Message Types
// ============================================================================

/** User message - starts a run */
export interface UserMessage {
  type: "user";
  id: string;
  text: string;
  createdAt: number;
  endedAt: number;
}

/** Assistant message - LLM response with optional tool calls */
export interface AssistantMessage {
  type: "assistant";
  id: string;
  text: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  status: "streaming" | "completed" | "error";
  createdAt: number;
  endedAt?: number;
}

/** Tool message - result of a tool execution */
export interface ToolMessage {
  type: "tool";
  id: string;
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  endedAt?: number;
}

/** Union of all message types */
export type Message = UserMessage | AssistantMessage | ToolMessage;

// ============================================================================
// Run Types
// ============================================================================

export type RunStatus = "running" | "completed" | "error";

/** A run represents a single user interaction cycle */
export interface Run {
  id: string;
  status: RunStatus;

  /** Messages within this run (chronological order) */
  messages: Message[];

  /** Token usage for this run */
  usage: TokenUsage;

  /** Number of tool calls in this run */
  toolCallCount: number;

  /** Timestamps */
  startedAt: number;
  endedAt?: number;

  /** Error message if status is "error" */
  error?: string;
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Full context data for persistence (UI display only).
 *
 * Note: AI conversation history is managed by the AI SDK via result.response.messages,
 * not stored here.
 */
export interface ContextData {
  agentId: string;
  runs: Run[];
  totalUsage: TokenUsage;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Legacy Exports (for backward compatibility during migration)
// ============================================================================

// These will be removed after migration is complete
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "streaming" | "completed" | "error";
