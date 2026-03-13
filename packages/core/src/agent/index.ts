// Agent exports
export {
  Agent,
  createAgent,
  AgentConfigSchema,
  type AgentStatus,
  type AgentConfig,
  type CreateAgentOptions,
  type ToolCallInfo,
  type ToolApprovalResponse as AgentToolApprovalResponse,
  type AgentCallbacks,
  type AgentRunOptions,
} from "./loop";

export type { Tools } from "./tools";

// Context exports - new types
export {
  AgentContext,
  generateAgentId,
  type TokenUsage,
  type ToolStatus,
  type ToolCall,
  type UserMessage,
  type AssistantMessage,
  type ToolMessage,
  type Message,
  type RunStatus,
  type Run,
  type ContextData,
} from "./agentContext";

// Context exports - legacy types (for backward compatibility)
export { type MessageRole, type MessageStatus } from "./agentContext";
