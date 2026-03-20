import { streamText } from "ai";

import { createTodoTool } from "../tools";

import type { StreamPart } from "./agent";
import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { TodoManager } from "../todo-manager";
import type {
  ToolSet,
  LanguageModel,
  ModelMessage,
  StreamTextOnStepFinishCallback,
  GenerateTextOnStepFinishCallback,
  StreamTextOnFinishCallback,
  GenerateTextOnFinishCallback,
} from "ai";

type Params = Parameters<typeof streamText>[0];

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted" | "waiting";

/** Run options */
export interface AgentRunOptions {
  /** User prompt (creates a user message) */
  prompt?: string;
  /** Messages array */
  messages?: ModelMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Override model for this run */
  model?: LanguageModel;
}

export class Base {
  // State
  status: AgentStatus = "idle";
  error = "";

  // Resources
  log: AgentLog | null = null;
  context: AgentContext | null = null;
  sandbox: Sandbox | null = null;
  todoManager: TodoManager | null = null;
  customTools: ToolSet = {};
  builtInTools: ToolSet = {};

  // Model (Vercel AI SDK LanguageModel)
  model: LanguageModel | null = null;

  // Abort controller for current run
  currentAbortController: AbortController | null = null;

  // ============================================================================
  // Resource Management
  // ============================================================================

  /**
   * Set the Vercel AI SDK LanguageModel
   */
  setModel(model: LanguageModel): void {
    this.model = model;
  }

  /**
   * Get the current model
   */
  getModel(): LanguageModel | null {
    return this.model;
  }

  /**
   * Set sandbox for tool execution
   */
  setSandbox(sandbox: Sandbox): void {
    this.sandbox = sandbox;
  }

  /**
   * Get sandbox
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  /**
   * Set built-in tools (from createTools)
   */
  setTools(tools: ToolSet): void {
    this.builtInTools = tools;
  }

  /**
   * Add custom tools
   */
  addTools(tools: ToolSet): void {
    this.customTools = { ...this.customTools, ...tools };
  }

  /**
   * Get all tools as Record for Vercel AI SDK
   */
  getTools(): ToolSet {
    return {
      ...this.builtInTools,
      ...this.customTools,
    };
  }

  /**
   * Set logger
   */
  setLog(c: AgentLog): void {
    this.log = c;
  }

  /**
   * Get logger
   */
  getLog(): AgentLog | null {
    return this.log;
  }

  /**
   * Set context
   */
  setContext(c: AgentContext): void {
    this.context = c;
  }

  /**
   * Get context
   */
  getContext(): AgentContext | null {
    return this.context;
  }

  /**
   * Set todo manager for task tracking
   */
  setTodoManager(t: TodoManager): void {
    if (this.todoManager) return;

    this.todoManager = t;

    this.addTools({ todo: createTodoTool({ todoManager: t }) });
  }

  /**
   * Get todo manager
   */
  getTodoManager(): TodoManager | null {
    return this.todoManager;
  }

  /**
   * Prepare messages from AgentCallParameters format.
   * Handles both `prompt` (string or ModelMessage[]) and `messages` parameters.
   * Also injects nag reminder if needed.
   */
  prepareMessages(options: { prompt?: string | ModelMessage[]; messages?: ModelMessage[] }): ModelMessage[] {
    const { prompt, messages } = options;
    const finalMessages: ModelMessage[] = [];

    if (messages) {
      finalMessages.push(...messages);
    }

    if (prompt) {
      if (typeof prompt === "string") {
        finalMessages.push({ role: "user" as const, content: prompt });
      } else {
        finalMessages.push(...prompt);
      }
    }

    // Inject nag reminder if todo manager says we should
    if (this.todoManager?.shouldNag()) {
      const reminder = this.todoManager.getNagReminder();
      this.log?.info("todo", "Injecting nag reminder", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });

      // Add reminder as a system message at the end
      finalMessages.push({
        role: "user" as const,
        content: reminder,
      });
    }

    return finalMessages;
  }

  /**
   * Set up abort controller and forward external abort signal.
   */
  setupAbortController(abortSignal?: AbortSignal): void {
    this.currentAbortController = new AbortController();

    if (abortSignal) {
      if (abortSignal.aborted) {
        this.currentAbortController.abort(abortSignal.reason);
      } else {
        abortSignal.addEventListener(
          "abort",
          () => {
            this.currentAbortController?.abort(abortSignal.reason);
          },
          { once: true }
        );
      }
    }
  }

  /**
   * Create onStepFinish callback that logs and updates context usage.
   * Also handles todo tracking for nag reminders.
   */
  createOnStepFinish(
    userCallback?: StreamTextOnStepFinishCallback<ToolSet> | GenerateTextOnStepFinishCallback<NoInfer<ToolSet>>
  ): StreamTextOnStepFinishCallback<ToolSet> | GenerateTextOnStepFinishCallback<NoInfer<ToolSet>> {
    return (event) => {
      const { stepNumber, toolCalls, toolResults, finishReason, usage } = event;

      this.log?.agent(`Step ${stepNumber} finished`, {
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
        toolResultCount: toolResults?.length ?? 0,
      });

      if (usage && this.context) {
        this.context.updateUsage({
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        });
      }

      // Track todo tool usage for nag reminder
      if (this.todoManager) {
        const usedTodo = toolCalls?.some((tc) => tc.toolName === "todo") ?? false;
        if (usedTodo) {
          this.todoManager.resetRoundCounter();
          this.log?.debug("todo", "Todo tool used, reset round counter");
        } else {
          this.todoManager.incrementRound();
          this.log?.debug("todo", `Todo not used, round ${this.todoManager.getRoundsSinceUpdate()}`);
        }
      }

      userCallback?.(event);
    };
  }

  createOnFinish(
    userCallback?: StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>>
  ): StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>> {
    return (event) => {
      if (this.status !== "waiting") {
        this.status = "completed";
      }

      this.log?.agent(`agent response finish`, event);

      this.context?.updateFinal?.(event);

      userCallback?.(event);
    };
  }

  /**
   * Check if an error is an abort error
   */
  isAbortError(err: unknown): boolean {
    if (err instanceof Error) {
      return err.name === "AbortError" || err.message.includes("aborted");
    }
    return false;
  }

  /**
   * Abort the current run
   */
  abort(reason?: string): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort(reason);
    }
  }

  /**
   * Check if a tool needs approval
   */
  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.getTools();
    const tool = tools[toolName];

    return tool ? tool.needsApproval === true : false;
  }

  // ============================================================================
  // Run (Streaming Generator)
  // ============================================================================

  /**
   * Run the agent and return an async iterable stream.
   * Uses Vercel AI SDK's streamText with built-in multi-step support.
   *
   * This is the original generator-based API that yields StreamPart directly.
   * For DirectChatTransport integration, use `stream()` instead.
   */
  async *run(options: AgentRunOptions & Params): AsyncIterable<StreamPart> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages = [],
      abortSignal,
      model: overrideModel,
      onStepFinish,
      onFinish,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      tools: extendTools,
      ...rest
    } = options;

    const finalMessages = this.prepareMessages({ prompt, messages });

    this.setupAbortController(abortSignal);
    this.status = "running";
    this.error = "";

    const tools = this.getTools();
    const finalTools = Object.assign(tools, extendTools);

    this.log?.agent("Starting streamText", {
      messageCount: finalMessages.length,
      messages: finalMessages,
      toolCount: Object.keys(tools).length,
      tools: Object.entries(tools).map(([name, t]) => ({
        name,
        needsApproval: t.needsApproval ?? false,
      })),
    });

    try {
      // Use Vercel AI SDK streamText
      const result = streamText({
        model: overrideModel || this.model,
        messages: finalMessages,
        tools: finalTools,
        abortSignal: this.currentAbortController!.signal,
        onStepFinish: this.createOnStepFinish(onStepFinish),
        onFinish: this.createOnFinish(onFinish),
        experimental_onToolCallStart: (event) => {
          const { toolCall } = event;
          this.log?.info("tool", "tool-call-start", {
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            input: toolCall.input,
          });
          experimental_onToolCallStart?.(event);
        },
        experimental_onToolCallFinish: (event) => {
          const { toolCall, durationMs } = event;
          const output = "output" in event ? event.output : undefined;
          const error = "error" in event ? event.error : undefined;

          this.log?.info("tool", "tool-call-end", {
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
            error: error instanceof Error ? error.message : error,
            durationMs,
          });
          experimental_onToolCallFinish?.(event);
        },

        ...rest,
      });

      // Stream the full response
      for await (const part of result.fullStream) {
        // Handle approval requests - update status
        if (part.type === "tool-call" && this.isToolNeedsApproval(part.toolName)) {
          this.status = "waiting";
        }

        // Emit to context for UI updates
        this.context?.emit(part);

        yield part;
      }

      // Check final status
      if (this.status !== "waiting") {
        this.status = "completed";
      }

      this.log?.agent("streamText completed", {
        finishReason: await result.finishReason,
        status: this.status,
      });
    } catch (err) {
      if (this.isAbortError(err)) {
        this.status = "aborted";
        this.log?.agent("Run aborted");
      } else {
        const error = err instanceof Error ? err : new Error(String(err));
        this.error = error.message;
        this.status = "error";
        this.log?.error("agent", "Run error", error);
        throw error;
      }
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.abort("Reset");
    this.status = "idle";
    this.error = "";
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
