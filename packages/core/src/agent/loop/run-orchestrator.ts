import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { AgentStatus, ToolSet } from "./types.js";
import type { OnToolExecutionEndCallback, OnToolExecutionStartCallback, TextStreamPart } from "ai";

// ============================================================================
// Host Interface
// ============================================================================

/** Surface the run orchestrator needs from Base / Agent. */
export interface RunOrchestratorHost {
  readonly status: AgentStatus;
  error: string;
  readonly log: AgentLog | null;
  readonly context: AgentContext | null;
  setStatus(status: AgentStatus): void;
  emitEvent(
    type: AgentEventType,
    data?: Record<string, unknown>,
    options?: { parentId?: string; agentId?: string }
  ): void;
  isToolNeedsApproval(toolName: string): boolean;
  isAbortError(err: unknown): boolean;
  handleReactiveCompact(err: unknown): Promise<boolean>;
}

type ToolStartCallback = OnToolExecutionStartCallback<ToolSet>;

type ToolEndCallback = OnToolExecutionEndCallback<ToolSet>;

// ============================================================================
// RunOrchestrator
// ============================================================================

/**
 * Coordinates per-run stream callbacks: status transitions, tool lifecycle,
 * and lifecycle events. Keeps Agent.stream() focused on SDK wiring.
 */
export class RunOrchestrator {
  constructor(private readonly host: RunOrchestratorHost) {}

  beginRun(): void {
    this.host.setStatus("running");
    this.host.error = "";
  }

  handleChunk(chunk: TextStreamPart<ToolSet>): void {
    if (chunk.type === "tool-call") {
      if (this.host.isToolNeedsApproval(chunk.toolName)) {
        this.host.setStatus("waiting");
        this.host.emitEvent("notification", { message: `Tool ${chunk.toolName} requires approval` });
      } else {
        this.host.setStatus("running");
      }
      return;
    }

    if (chunk.type === "reasoning-delta") {
      this.host.setStatus("thinking");
      return;
    }

    if (this.host.status === "running" || this.host.status === "thinking") {
      this.host.setStatus("responding");
    }
  }

  handleAbort(): void {
    this.host.setStatus("aborted");
    this.host.log?.agent("stream aborted");
  }

  async handleError(err: unknown): Promise<void> {
    if (this.host.isAbortError(err)) {
      this.host.setStatus("aborted");
      this.host.log?.agent("Stream aborted via error", { error: (err as Error)?.message });
      return;
    }

    const compacted = await this.host.handleReactiveCompact(err);
    if (compacted) {
      this.host.log?.info(
        "agent",
        "Reactive compact succeeded, but stream cannot auto-retry. Next user message will use compacted context."
      );
    }

    this.host.setStatus("error");
    this.host.error = (err as Error)?.message;
    this.host.log?.error("agent", "Stream error", err as Error);
  }

  handleToolStart(event: Parameters<ToolStartCallback>[0], userCallback?: ToolStartCallback): void {
    const { toolCall } = event;
    this.host.setStatus("running");
    this.host.log?.tool("tool-call-start", {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    });
    this.host.context?.recordToolCall(toolCall);
    this.host.emitEvent("tool:start", {
      tool_name: toolCall.toolName,
      tool_call_id: toolCall.toolCallId,
      tool_input: toolCall.input,
    });
    userCallback?.(event);
  }

  handleToolEnd(event: Parameters<ToolEndCallback>[0], userCallback?: ToolEndCallback): void {
    const { toolCall, toolExecutionMs } = event;
    const output = "output" in event ? event.output : undefined;
    const error = "error" in event ? event.error : undefined;

    this.host.log?.tool("tool-call-end", {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      output,
      error: error instanceof Error ? error.message : error,
      durationMs: toolExecutionMs,
    });

    if (error) {
      this.host.emitEvent("tool:error", {
        tool_name: toolCall.toolName,
        tool_input: toolCall.input,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      this.host.emitEvent("tool:post", {
        tool_name: toolCall.toolName,
        tool_input: toolCall.input,
        tool_output: output,
        duration_ms: toolExecutionMs ?? 0,
      });
    }

    userCallback?.(event);
  }

  /** Create AI SDK streamText callback bundle for a single run. */
  createStreamHandlers(callbacks: { onToolExecutionStart?: ToolStartCallback; onToolExecutionEnd?: ToolEndCallback }) {
    return {
      onChunk: ({ chunk }: { chunk: TextStreamPart<ToolSet> }) => this.handleChunk(chunk),
      onAbort: () => this.handleAbort(),
      onError: async (event: { error: unknown }) => this.handleError(event.error),
      onToolExecutionStart: (event: Parameters<ToolStartCallback>[0]) =>
        this.handleToolStart(event, callbacks.onToolExecutionStart),
      onToolExecutionEnd: (event: Parameters<ToolEndCallback>[0]) =>
        this.handleToolEnd(event, callbacks.onToolExecutionEnd),
    };
  }
}
