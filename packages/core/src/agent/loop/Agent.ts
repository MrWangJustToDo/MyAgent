import { generateText, streamText, stepCountIs } from "ai";
import { z } from "zod";

import { type EnvironmentType, type Sandbox } from "../../environment/types.js";
import { sandboxManager, toolsManager } from "../../managers";
import { createModel } from "../../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../../types.js";
import { AgentContext, generateAgentId } from "../agentContext";
import { type Tools } from "../tools";

import type { SandboxManager, ToolsManager } from "../../managers";
import type { ToolSet, LanguageModel, ModelMessage, Tool } from "ai";

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Agent status
 */
export type AgentStatus = "idle" | "initializing" | "running" | "waiting_approval" | "completed" | "error";

/**
 * Agent configuration schema for validation
 */
export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxSteps: z.number().int().min(1).max(100).optional().describe("Maximum number of steps"),
  rootPath: z.string().min(1).describe("The sandbox root path for file operations"),
  envs: z.record(z.string(), z.string()).optional().describe("Environment variables for sandbox"),
  // Note: environment is validated separately since it can be a string or object
});

export type AgentConfig = z.infer<typeof AgentConfigSchema> & {
  /**
   * Environment to use for sandbox operations.
   * - 'local': Use local just-bash environment (default)
   * - 'remote': Use remote compute gateway (requires configuration)
   * - Environment: Custom environment instance
   */
  environment?: EnvironmentType;
};

/**
 * Tool call information for approval workflow
 */
export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool approval response
 */
export interface ToolApprovalResponse {
  toolCallId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Callbacks for agent lifecycle events
 */
export interface AgentCallbacks {
  /** Called when text is streamed */
  onToken?: (token: string) => void;
  /** Called when reasoning is streamed */
  onReasoning?: (token: string) => void;

  staticProps?: Omit<Parameters<typeof generateText>[0], "model" | "messages" | "tools" | "abortSignal" | "prompt">;

  streamProps?: Omit<Parameters<typeof streamText>[0], "model" | "messages" | "tools" | "abortSignal" | "prompt">;
}

/**
 * Options for running the agent
 */
export interface AgentRunOptions extends AgentCallbacks {
  /** The task/prompt to execute */
  prompt: string;
  /** Optional conversation history */
  messages?: ModelMessage[];
  /** Additional tools to include (merged with built-in tools) */
  additionalTools?: ToolSet;
  /** Override max steps for this run */
  maxSteps?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Whether to use streaming (default: true) */
  stream?: boolean;
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * Full-featured agent implementation using AI SDK
 *
 * Features:
 * - Reactive state (status, result, error) for UI binding
 * - Sandbox-based file operations
 * - Built-in tools for file manipulation, command execution, etc.
 * - Streaming support with text and reasoning callbacks
 * - Tool approval workflow for dangerous operations
 * - Step-by-step execution with callbacks
 * - Conversation history support
 *
 * State Architecture:
 * - Agent: manages high-level state (status, result, error) for header/footer
 * - AgentContext: manages messages (runs, messages, tools) for content display
 *
 * @example
 * ```typescript
 * const agent = new Agent({ model: "gpt-4", rootPath: "/path" });
 * await agent.initialize();
 *
 * // Reactive state for UI
 * console.log(agent.status);  // "idle"
 *
 * await agent.run({ prompt: "Hello" });
 *
 * console.log(agent.status);  // "completed"
 * console.log(agent.result);  // AgentRunResult
 *
 * // Messages from context
 * const messages = agent.context.getCurrentMessages();
 * ```
 */
export class Agent {
  /** Unique agent identifier */
  readonly id: string;

  // ============================================================================
  // Reactive State (for UI binding via reactivity-store)
  // ============================================================================

  /** Current agent status */
  status: AgentStatus = "idle";

  /** Error message (if status is "error") */
  error = "";

  resume = () => Promise.resolve<null | undefined>(null);

  // ============================================================================
  // Internal State
  // ============================================================================

  private config: AgentConfig;
  private model: LanguageModel;
  private sandbox: Sandbox | null = null;
  private tools: Tools | null = null;
  private initialized = false;

  modelName = "";

  sandboxName = "";

  /** Context for tracking runs, messages, tools, and token usage */
  readonly context: AgentContext;

  /** Manager for sandbox instances */
  private readonly sandboxManager: SandboxManager;

  /** Manager for tool instances */
  private readonly toolsManager: ToolsManager;

  constructor(
    config: AgentConfig,
    agentId?: string,
    managers?: { sandbox?: SandboxManager; tools?: ToolsManager },
    setUp?: (item: Agent) => Agent
  ) {
    // Generate or use provided agent ID
    this.id = agentId ?? generateAgentId();

    // Initialize context with agent ID
    this.context = new AgentContext(this.id);

    // Use provided managers or default singletons
    this.sandboxManager = managers?.sandbox ?? sandboxManager;
    this.toolsManager = managers?.tools ?? toolsManager;

    // Validate config (environment is validated separately)
    const { environment, ...restConfig } = config;
    this.config = { ...AgentConfigSchema.parse(restConfig), environment };
    this.model = createModel(this.config.model, this.config.baseURL ?? DEFAULT_OLLAMA_API_URL);

    if (setUp) {
      return setUp(this);
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the agent (sandbox and tools)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.modelName = this.config.model;

    this.status = "initializing";

    try {
      // Set environment if specified
      if (this.config.environment) {
        this.sandboxManager.setEnvironment(this.config.environment);
      }

      // Initialize sandbox
      this.sandbox = await this.sandboxManager.getSandbox(this.config.rootPath);

      this.sandboxName = this.sandbox.provider;

      // Initialize tools
      this.tools = await this.toolsManager.getTools(this.config.rootPath);

      this.initialized = true;

      this.status = "idle";
    } catch (err) {
      this.error = `Failed to initialize: ${(err as Error).message}`;

      this.status = "error";

      throw err;
    }

    if (this.config.systemPrompt) {
      this.context.trackOriginalMessage({ role: "system", content: this.config.systemPrompt });
    }
  }

  /**
   * Get the built-in tools as a ToolSet
   */
  getTools(): ToolSet {
    if (!this.tools) {
      throw new Error("Agent not initialized. Call initialize() first.");
    }
    return this.tools as unknown as ToolSet;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Merge built-in tools with additional tools
   */
  private mergeTools(additionalTools?: ToolSet): ToolSet {
    const builtInTools = this.getTools();
    if (!additionalTools) return builtInTools;
    return { ...builtInTools, ...additionalTools };
  }

  /**
   * Convert AI SDK tool call to ToolCallInfo
   */
  private toToolCallInfo(tc: { toolCallId: string; toolName: string; args?: unknown }): ToolCallInfo {
    return {
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: "args" in tc && tc.args ? (tc.args as Record<string, unknown>) : {},
    };
  }

  private getToolCall(toolCallName: string) {
    return this.tools?.[toolCallName as keyof Tools] as Tool | null;
  }

  // private createToolApproval

  // ============================================================================
  // Run Methods
  // ============================================================================

  /**
   * Run the agent with streaming
   */
  async runStream(options: AgentRunOptions) {
    await this.initialize();

    const {
      prompt,
      messages,
      additionalTools,
      maxSteps = this.config.maxSteps ?? 10,
      abortSignal,
      onToken,
      onReasoning,
      streamProps = {},
    } = options;

    const {
      stopWhen,
      experimental_onStepStart,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      onStepFinish,
      onFinish,
      onError,
      ...restProps
    } = streamProps;

    if (messages && messages.length) {
      this.context.trackOriginalMessages(messages);
    }

    if (prompt) {
      this.context.trackOriginalMessage({ role: "user", content: prompt });
    }

    const history = this.context.getOriginalMessage();

    // Reset state for new run
    this.status = "running";
    this.error = "";

    const mergedTools = this.mergeTools(additionalTools);

    // Start run in context (this also creates the user message)
    this.context.startRun(prompt);

    try {
      const result = streamText({
        model: this.model,
        messages: history,
        tools: mergedTools,
        stopWhen: stopWhen || stepCountIs(maxSteps),
        abortSignal,
        experimental_onStepStart: (event) => {
          // Start new assistant message for this step
          this.context.startAssistantMessage();
          experimental_onStepStart?.(event);
        },
        experimental_onToolCallStart: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);

          this.context.startTool(toolCallInfo.toolCallId);

          experimental_onToolCallStart?.(event);
        },
        experimental_onToolCallFinish: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);
          const toolResult = event.success ? event.output : event.error;
          if (event.success) {
            this.context.completeTool(toolCallInfo.toolCallId, toolResult);
          } else {
            this.context.failTool(toolCallInfo.toolCallId, String(event.error));
          }
          // Add tool result message
          this.context.startToolMessage(toolCallInfo.toolCallId, toolCallInfo.toolName);
          this.context.completeToolMessage(
            toolCallInfo.toolCallId,
            event.success ? toolResult : undefined,
            event.success ? undefined : String(event.error)
          );
          experimental_onToolCallFinish?.(event);
        },
        onStepFinish: (event) => {
          const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = event.usage;

          this.context.updateUsage({ inputTokens, outputTokens, totalTokens });

          this.context.completeAssistantMessage();

          onStepFinish?.(event);
        },
        onFinish: (event) => {
          const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = event.usage;

          this.context.completeRun({ inputTokens, outputTokens, totalTokens });

          this.context.trackOriginalMessages(event.response.messages);

          onFinish?.(event);
        },
        onError: (event) => {
          this.status = "error";

          this.error = (event.error as Error).message;

          onError?.(event);
        },
        ...restProps,
      });

      // Process fullStream to handle both text and reasoning in one pass
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          this.context.appendText(part.text);
          onToken?.(part.text);
        } else if (part.type === "reasoning-delta") {
          this.context.appendReasoning(part.text);
          onReasoning?.(part.text);
        } else if (part.type === "tool-call") {
          this.context.addToolCall({
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          });
        } else if (part.type === "tool-approval-request") {
          this.context.changeToolCall(part.toolCall.toolCallId, "need-approve");
          this.status = "waiting_approval";
          this.resume = () =>
            Promise.all([
              this.runStream({ prompt: "I have process all the request, continue" }),
              (this.resume = () => Promise.resolve(null)),
            ]).then(() => null);
        } else if (part.type === "tool-input-start") {
          // const toolCallInfo = this.toToolCallInfo(part.);
          // this.context.startTool(toolCallInfo.toolCallId);
        }
      }
      if (this.status === "waiting_approval") return;
      this.status = "completed";
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.context.errorRun(err.message);
      this.error = err.message;
      this.status = "error";
      throw err;
    }
  }

  /**
   * Run the agent without streaming (simpler, returns full result)
   */
  async runGenerate(options: AgentRunOptions) {
    await this.initialize();

    const {
      prompt,
      messages,
      additionalTools,
      maxSteps = this.config.maxSteps ?? 10,
      abortSignal,
      staticProps = {},
    } = options;

    const {
      stopWhen,
      experimental_onStepStart,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      onStepFinish,
      onFinish,
      ...restProps
    } = staticProps;

    if (messages && messages.length) {
      this.context.trackOriginalMessages(messages);
    }

    if (prompt) {
      this.context.trackOriginalMessage({ role: "user", content: prompt });
    }

    const history = this.context.getOriginalMessage();

    // Reset state for new run
    this.status = "running";
    this.error = "";

    const mergedTools = this.mergeTools(additionalTools);

    // Start run in context (this also creates the user message)
    this.context.startRun(prompt);

    try {
      const result = await generateText({
        model: this.model,
        messages: history,
        tools: mergedTools,
        stopWhen: stopWhen || stepCountIs(maxSteps),
        abortSignal,
        experimental_onStepStart: (event) => {
          this.context.startAssistantMessage();
          experimental_onStepStart?.(event);
        },
        experimental_onToolCallStart: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);

          this.context.startTool(toolCallInfo.toolCallId);
          experimental_onToolCallStart?.(event);
        },
        experimental_onToolCallFinish: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);
          const toolResult = event.success ? event.output : event.error;
          if (event.success) {
            this.context.completeTool(toolCallInfo.toolCallId, toolResult);
          } else {
            this.context.failTool(toolCallInfo.toolCallId, String(event.error));
          }
          // Add tool result message
          this.context.startToolMessage(toolCallInfo.toolCallId, toolCallInfo.toolName);
          this.context.completeToolMessage(
            toolCallInfo.toolCallId,
            event.success ? toolResult : undefined,
            event.success ? undefined : String(event.error)
          );
          experimental_onToolCallFinish?.(event);
        },
        onStepFinish: (event) => {
          const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = event.usage;

          this.context.updateUsage({ inputTokens, outputTokens, totalTokens });

          this.context.completeAssistantMessage();

          onStepFinish?.(event);
        },
        onFinish: (event) => {
          const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = event.usage;

          this.context.completeRun({ inputTokens, outputTokens, totalTokens });

          this.context.trackOriginalMessages(event.response.messages);

          onFinish?.(event);
        },
        ...restProps,
      });

      this.context.setText(result.text);

      this.context.setReasoning(result.reasoningText || "");

      for (const part of result.content) {
        if (part.type === "tool-call") {
          this.context.addToolCall({
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          });
        } else if (part.type === "tool-approval-request") {
          this.context.changeToolCall(part.toolCall.toolCallId, "need-approve");
          this.status = "waiting_approval";
          this.resume = () =>
            Promise.all([
              this.runStream({ prompt: "I have process all the request, continue" }),
              (this.resume = () => Promise.resolve(null)),
            ]).then(() => null);
        }
      }

      if (this.status === "waiting_approval") return;

      this.status = "completed";
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.context.errorRun(err.message);
      this.error = err.message;
      this.status = "error";
      throw err;
    }
  }

  /**
   * Run the agent (auto-selects streaming based on options)
   */
  async run(options: AgentRunOptions) {
    const shouldStream =
      options.stream !== false && (options.onToken !== undefined || options.onReasoning !== undefined);

    if (shouldStream) {
      return this.runStream(options);
    }
    return this.runGenerate(options);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Cleanup agent resources
   */
  async destroy(): Promise<void> {
    if (this.config.rootPath) {
      // Clean up tools first, then sandbox
      this.toolsManager.deleteTools(this.config.rootPath);
      await this.sandboxManager.deleteSandbox(this.config.rootPath);
    }
    this.sandbox = null;
    this.tools = null;
    this.initialized = false;
    this.status = "idle";
    this.error = "";
  }

  /**
   * Reset agent state (keeps agent initialized)
   */
  reset(): void {
    this.status = "idle";
    this.error = "";
    this.context.reset();
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Get agent configuration
   */
  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  /**
   * Check if agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the sandbox instance
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Options for creating an agent
 */
export interface CreateAgentOptions extends AgentConfig {
  /** Optional agent ID (auto-generated if not provided) */
  agentId?: string;
  /** Optional custom managers (defaults to singletons) */
  managers?: {
    sandbox?: SandboxManager;
    tools?: ToolsManager;
  };
  /** Optional setUp function for transforming the agent (used for Vue reactivity proxy wrapping) */
  setUp?: (agent: Agent) => Agent;
}

/**
 * Create a new agent instance
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   model: "gpt-4",
 *   rootPath: "/path/to/project",
 *   systemPrompt: "You are a helpful coding assistant.",
 * });
 *
 * // Agent state
 * console.log(agent.status);  // "idle"
 *
 * const result = await agent.run({
 *   prompt: "Create a hello world function",
 *   onToken: (token) => process.stdout.write(token),
 * });
 *
 * console.log(agent.status);  // "completed"
 * console.log(agent.result);  // AgentRunResult
 *
 * // Messages from context
 * const messages = agent.context.getCurrentMessages();
 *
 * await agent.destroy();
 * ```
 */
export async function createAgent(options: CreateAgentOptions): Promise<Agent> {
  const { agentId, setUp, managers, ...config } = options;
  const agent = new Agent(config, agentId, managers, setUp);
  await agent.initialize();
  return agent;
}
