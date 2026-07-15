import { chat, maxIterations } from "@tanstack/ai";

import { agentManager } from "../../managers/manager-agent.js";
import { assertAsyncIterable } from "../utils/assert-async-iterable.js";

import { createToolRunContext, type ToolRunContext } from "./run-context.js";

import type {
  AnyTextAdapter,
  ChatMiddleware,
  ModelMessage,
  ServerTool,
  StreamChunk,
  UIMessage,
  SystemPrompt,
} from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface AgentRunnerConfig {
  adapter: AnyTextAdapter;
  /** Model id (informational — already bound on the adapter from {@link createTextAdapter}). */
  model: string;
  maxIterations?: number;
  systemPrompts?: Array<SystemPrompt>;
  tools?: ServerTool[];
  middleware?: ChatMiddleware<ToolRunContext>[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AgentRunnerRunInput {
  messages?: Array<UIMessage | ModelMessage>;
  /**
   * Preferred: the same AbortController identity owned by {@link ManagedAgent.run}.
   * `ManagedAgent.abort()` must abort this controller to cancel TanStack `chat()`.
   * Production runs always pass this (via executeManagedAgentRun after prepareForRun).
   */
  abortController?: AbortController;
  /**
   * Fallback only: when `abortController` is omitted, create a fresh controller and
   * link this signal. Not used by the main/subagent run path today; kept for
   * resolveAbortController / ad-hoc AgentRunner callers.
   */
  abortSignal?: AbortSignal;
  threadId?: string;
  runId?: string;
  agentId: string;
}

// ============================================================================
// AgentRunner
// ============================================================================

/**
 * Lightweight TanStack `chat()` wrapper. Holds immutable configuration only —
 * no status, session, memory, or usage state between runs.
 */
export class AgentRunner {
  private readonly config: AgentRunnerConfig;

  constructor(config: AgentRunnerConfig) {
    this.config = config;
  }

  /** Resolve the AbortController passed to TanStack `chat()`. */
  static resolveAbortController(input: Pick<AgentRunnerRunInput, "abortController" | "abortSignal">): AbortController {
    if (input.abortController) {
      return input.abortController;
    }

    const abortController = new AbortController();
    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        abortController.abort(input.abortSignal.reason);
      } else {
        input.abortSignal.addEventListener("abort", () => abortController.abort(input.abortSignal!.reason), {
          once: true,
        });
      }
    }
    return abortController;
  }

  /** Execute one agent run and yield AG-UI stream chunks. */
  run(input: AgentRunnerRunInput): AsyncIterable<StreamChunk> {
    const abortController = AgentRunner.resolveAbortController(input);

    const toolContext = createToolRunContext(input.agentId);

    agentManager
      .getAgent(agentManager.getAgent(input.agentId)?.parentId || input.agentId)
      ?.log.agent(`agent ${input.agentId} start chat`, {
        prompt: this.config.systemPrompts,
      });

    const stream = chat({
      adapter: this.config.adapter,
      messages: input.messages,
      systemPrompts: this.config.systemPrompts,
      tools: this.config.tools,
      middleware: this.config.middleware,
      context: toolContext,
      abortController,
      threadId: input.threadId,
      runId: input.runId,
      agentLoopStrategy: maxIterations(this.config.maxIterations ?? 30),
      modelOptions: {
        ...(this.config.temperature != null ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxOutputTokens != null ? { maxTokens: this.config.maxOutputTokens } : {}),
      },
    });

    assertAsyncIterable(stream, `chat(model=${this.config.model})`);
    return stream;
  }
}
