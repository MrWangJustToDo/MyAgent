import type {
  Run,
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  TokenUsage,
  ContextData,
} from "./types.js";
import type { ModelMessage, ToolApprovalResponse } from "ai";

// ============================================================================
// ID Generators
// ============================================================================

let idCounter = 0;

const generateId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${++idCounter}`;
};

/**
 * Generate a unique agent ID
 */
export const generateAgentId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `agent_${timestamp}_${random}`;
};

// ============================================================================
// AgentContext Class
// ============================================================================

/**
 * AgentContext tracks agent state for UI display using a Run-centric architecture.
 *
 * **Important**: This context is for UI/display purposes only.
 * AI conversation history (including tool calls/results) is managed by the AI SDK
 * via `result.response.messages`.
 *
 * Flow: User Input → Run Start → Messages (user, assistant, tool) → Run End
 *
 * @example
 * ```typescript
 * const context = new AgentContext("agent_123");
 *
 * // Start a run with user input
 * context.startRun("Create a hello.ts file");
 *
 * // LLM responds with streaming text
 * context.startAssistantMessage();
 * context.appendText("I'll create the file...");
 * context.addToolCall({ id: "tc_1", name: "write_file", args: { path: "hello.ts" } });
 * context.completeAssistantMessage();
 *
 * // Tool executes
 * context.startToolMessage("tc_1", "write_file");
 * context.completeToolMessage("tc_1", { success: true });
 *
 * // Run completes
 * context.completeRun();
 * ```
 */
export class AgentContext {
  /** Unique agent ID */
  readonly agentId: string;

  /** All runs (completed and current) */
  private runs: Run[] = [];

  /** Current active run */
  private currentRun: Run | null = null;

  /** Total token usage across all runs */
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  private messages: ModelMessage[] = [];

  private allPendingApprove: ToolCall[] = [];

  /** Current assistant message being streamed */
  private currentAssistant: AssistantMessage | null = null;

  private createdAt: number;
  private updatedAt: number;

  constructor(agentId?: string) {
    this.agentId = agentId ?? generateAgentId();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private createEmptyUsage(): TokenUsage {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  // ============================================================================
  // Run Management
  // ============================================================================

  /**
   * Start a new run with user input
   */
  startRun(prompt: string): Run {
    // Complete any existing run
    if (this.currentRun && this.currentRun.status === "running") {
      this.completeRun();
    }

    const now = Date.now();

    // Create user message
    const userMessage: UserMessage = {
      type: "user",
      id: generateId("msg"),
      text: prompt,
      createdAt: now,
      endedAt: now,
    };

    // Create run
    const run: Run = {
      id: generateId("run"),
      status: "running",
      messages: [userMessage],
      usage: this.createEmptyUsage(),
      toolCallCount: 0,
      startedAt: now,
    };

    this.runs.push(run);
    this.currentRun = run;

    this.touch();
    return run;
  }

  /**
   * Complete the current run
   */
  completeRun(usage?: TokenUsage): void {
    if (!this.currentRun) return;

    // Complete any streaming assistant message
    if (this.currentAssistant) {
      this.completeAssistantMessage();
    }

    this.currentRun.status = "completed";
    this.currentRun.endedAt = Date.now();

    if (usage) {
      this.currentRun.usage = usage;
      this.totalUsage.inputTokens += usage.inputTokens;
      this.totalUsage.outputTokens += usage.outputTokens;
      this.totalUsage.totalTokens += usage.totalTokens;
    }

    this.currentRun = null;
    this.touch();
  }

  /**
   * Mark current run as error
   */
  errorRun(error: string): void {
    if (!this.currentRun) return;

    // Complete any streaming assistant message with error
    if (this.currentAssistant) {
      this.errorAssistantMessage(error);
    }

    this.currentRun.status = "error";
    this.currentRun.error = error;
    this.currentRun.endedAt = Date.now();
    this.currentRun = null;
    this.touch();
  }

  /**
   * Update token usage for current run (called per step)
   */
  updateUsage(stepUsage: TokenUsage): void {
    if (!this.currentRun) return;

    this.currentRun.usage.inputTokens += stepUsage.inputTokens;
    this.currentRun.usage.outputTokens += stepUsage.outputTokens;
    this.currentRun.usage.totalTokens += stepUsage.totalTokens;
    this.touch();
  }

  // ============================================================================
  // Assistant Message Management
  // ============================================================================

  /**
   * Start a new assistant message (for streaming)
   */
  startAssistantMessage(): AssistantMessage {
    if (!this.currentRun) {
      throw new Error("Cannot start assistant message without an active run");
    }

    // Complete any existing assistant message
    if (this.currentAssistant) {
      this.completeAssistantMessage();
    }

    const message: AssistantMessage = {
      type: "assistant",
      id: generateId("msg"),
      text: "",
      toolCalls: [],
      status: "streaming",
      createdAt: Date.now(),
    };

    // this.currentRun.messages.push(message);
    this.currentAssistant = message;
    this.touch();

    return message;
  }

  /**
   * Append text to current assistant message (streaming)
   */
  appendText(text: string): void {
    if (!this.currentAssistant) return;

    this.currentAssistant.text += text;
    this.touch();
  }

  /**
   * Append reasoning to current assistant message
   */
  appendReasoning(text: string): void {
    if (!this.currentAssistant) return;

    this.currentAssistant.reasoning = (this.currentAssistant.reasoning ?? "") + text;
    this.touch();
  }

  /**
   * Set full text
   */
  setText(text: string): void {
    if (!this.currentAssistant) return;

    this.currentAssistant.text = text;
    this.touch();
  }

  setReasoning(text: string): void {
    if (!this.currentAssistant) return;

    this.currentAssistant.reasoning = text;

    this.touch();
  }

  /**
   * Complete current assistant message
   */
  completeAssistantMessage(): void {
    if (!this.currentAssistant || !this.currentRun) return;

    this.currentAssistant.status = "completed";

    this.currentAssistant.endedAt = Date.now();

    this.currentRun.messages.push(this.currentAssistant);

    this.currentAssistant = null;

    this.touch();
  }

  /**
   * Mark current assistant message as error
   */
  errorAssistantMessage(error: string): void {
    if (!this.currentAssistant || !this.currentRun) return;

    this.currentAssistant.status = "error";

    this.currentAssistant.text += `\n\nError: ${error}`;

    this.currentAssistant.endedAt = Date.now();

    this.currentRun.messages.push(this.currentAssistant);

    this.currentAssistant = null;

    this.touch();
  }

  // ============================================================================
  // Tool Call Management
  // ============================================================================

  /**
   * Add a tool call to current assistant message
   */
  addToolCall(toolCall: { id: string; name: string; args: Record<string, unknown> }, needsApproval = false): ToolCall {
    // Auto-start assistant message if needed
    if (!this.currentAssistant) {
      this.startAssistantMessage();
    }

    const tc: ToolCall = {
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args,
      status: needsApproval ? "need-approve" : "pending",
      startedAt: Date.now(),
    };

    this.currentAssistant!.toolCalls.push(tc);

    if (this.currentRun) {
      this.currentRun.toolCallCount++;
    }

    if (needsApproval) {
      this.allPendingApprove.push(tc);
    }

    this.touch();
    return tc;
  }

  changeToolCall(toolCallId: string, status?: ToolCall["status"]) {
    const tool = this.findToolCall(toolCallId);

    if (tool) {
      tool.status = status || tool.status;

      if (tool.status === "need-approve") {
        this.allPendingApprove.push(tool);
      }
    }
  }

  /**
   * Find a tool call by ID across all messages
   */
  findToolCall(toolCallId: string): ToolCall | undefined {
    for (const run of this.runs) {
      for (const msg of run.messages) {
        if (msg.type === "assistant") {
          const tc = msg.toolCalls.find((t) => t.id === toolCallId);
          if (tc) return tc;
        }
      }
    }
    return undefined;
  }

  /**
   * Start tool execution
   */
  startTool(toolCallId: string): void {
    const tc = this.findToolCall(toolCallId);
    if (!tc) return;

    tc.status = "running";
    this.touch();
  }

  /**
   * Complete tool successfully
   */
  completeTool(toolCallId: string, result?: unknown): void {
    const tc = this.findToolCall(toolCallId);
    if (!tc) return;

    tc.status = "success";
    tc.result = result;
    tc.endedAt = Date.now();
    this.touch();
  }

  /**
   * Fail tool with error
   */
  failTool(toolCallId: string, error: string): void {
    const tc = this.findToolCall(toolCallId);
    if (!tc) return;

    tc.status = "error";
    tc.error = error;
    tc.endedAt = Date.now();
    this.touch();
  }

  /**
   * Approve a tool call
   */
  approveTool(toolCallId: string) {
    const tc = this.findToolCall(toolCallId);
    if (!tc || tc.status !== "need-approve") return null;

    tc.status = "running";

    const message: ToolApprovalResponse = {
      type: "tool-approval-response",
      approvalId: toolCallId,
      approved: true, // or false to deny
    };

    this.allPendingApprove = this.allPendingApprove.filter((i) => i.status !== "need-approve");

    this.trackOriginalMessage({ role: "tool", content: [message] });

    this.touch();
  }

  /**
   * Reject a tool call
   */
  rejectTool(toolCallId: string, reason = "User denied") {
    const tc = this.findToolCall(toolCallId);
    if (!tc || tc.status !== "need-approve") return null;

    tc.status = "rejected";
    tc.error = reason;
    tc.endedAt = Date.now();

    const message: ToolApprovalResponse = {
      type: "tool-approval-response",
      approvalId: toolCallId,
      approved: false,
      reason,
    };

    this.allPendingApprove = this.allPendingApprove.filter((i) => i.status !== "need-approve");

    this.trackOriginalMessage({ role: "tool", content: [message] });

    this.touch();
  }

  // ============================================================================
  // Tool Message Management
  // ============================================================================

  /**
   * Start a tool result message
   */
  startToolMessage(toolCallId: string, toolName: string): ToolMessage {
    if (!this.currentRun) {
      throw new Error("Cannot add tool message without an active run");
    }

    const message: ToolMessage = {
      type: "tool",
      id: generateId("msg"),
      toolCallId,
      toolName,
      createdAt: Date.now(),
    };

    this.currentRun.messages.push(message);
    this.touch();

    return message;
  }

  /**
   * Complete a tool message with result
   */
  completeToolMessage(toolCallId: string, result?: unknown, error?: string): void {
    if (!this.currentRun) return;

    // Find the tool message
    const msg = this.currentRun.messages.find((m) => m.type === "tool" && m.toolCallId === toolCallId) as
      | ToolMessage
      | undefined;

    if (!msg) return;

    msg.result = result;
    msg.error = error;
    msg.endedAt = Date.now();
    this.touch();
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all runs
   */
  getRuns(): readonly Run[] {
    return this.runs;
  }

  /**
   * Get current run
   */
  getCurrentRun(): Run | null {
    return this.currentRun;
  }

  /**
   * Get total token usage
   */
  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * Get current assistant message (streaming)
   */
  getCurrentAssistant(): AssistantMessage | null {
    return this.currentAssistant;
  }

  /**
   * Get current streaming text
   */
  getCurrentText(): string {
    return this.currentAssistant?.text ?? "";
  }

  /**
   * Get current reasoning text
   */
  getCurrentReasoning(): string {
    return this.currentAssistant?.reasoning ?? "";
  }

  /**
   * Get all tool calls from current run
   */
  getCurrentToolCalls(): ToolCall[] {
    if (!this.currentRun) return [];

    const tools: ToolCall[] = [];
    for (const msg of this.currentRun.messages) {
      if (msg.type === "assistant") {
        tools.push(...msg.toolCalls);
      }
    }
    return tools;
  }

  /**
   * Get all messages from current run
   */
  getCurrentMessages(): Message[] {
    return this.currentRun?.messages ?? [];
  }

  /**
   * Get all messages from all runs (for display)
   */
  getAllMessages(): Message[] {
    const messages: Message[] = [];
    for (const run of this.runs) {
      messages.push(...run.messages);
    }
    return messages;
  }

  getAllPendingApprove() {
    const tools: ToolCall[] = [];
    for (const tool of this.allPendingApprove) {
      tools.push(tool);
    }
    return tools;
  }

  trackOriginalMessage(m: ModelMessage) {
    this.messages.push(m);
  }

  trackOriginalMessages(m: ModelMessage[]) {
    this.messages.push(...m);
  }

  getOriginalMessage() {
    return this.messages.slice(0);
  }

  // ============================================================================
  // Reset / Clear
  // ============================================================================

  /**
   * Clear current run
   */
  clearCurrentRun(): void {
    if (this.currentRun) {
      this.currentRun = null;
      this.currentAssistant = null;
    }
    this.touch();
  }

  /**
   * Reset everything
   */
  reset(): void {
    this.runs = [];
    this.currentRun = null;
    this.currentAssistant = null;
    this.totalUsage = this.createEmptyUsage();
    this.touch();
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export context as JSON (for persistence/display only, not for AI history)
   */
  toJSON(): ContextData {
    return {
      agentId: this.agentId,
      runs: this.runs,
      totalUsage: this.totalUsage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Import context from JSON
   */
  fromJSON(data: ContextData): void {
    this.runs = data.runs;
    this.totalUsage = data.totalUsage;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;

    // Reset transient state
    this.currentRun = null;
    this.currentAssistant = null;
  }

  /**
   * Create context from JSON data
   */
  static fromJSON(data: ContextData): AgentContext {
    const context = new AgentContext(data.agentId);
    context.fromJSON(data);
    return context;
  }
}
