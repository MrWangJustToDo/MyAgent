/* eslint-disable max-lines */
import { generateText, streamText, stepCountIs } from "ai";
import { z } from "zod";

import { type EnvironmentType, type Sandbox } from "../../environment/types.js";
import { sandboxManager, toolsManager } from "../../managers";
import { createModel } from "../../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../../types.js";
import { AgentContext, generateAgentId } from "../agentContext";
import { type Tools } from "../tools";

import type { SandboxManager, ToolsManager } from "../../managers";
import type { ToolSet, LanguageModel } from "ai";

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
 * Step information for callbacks
 */
export interface AgentStepInfo {
  stepNumber: number;
  text: string;
  reasoning?: string;
  toolCalls: ToolCallInfo[];
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    result: unknown;
  }>;
  finishReason: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Agent run result
 */
export interface AgentRunResult {
  text: string;
  reasoning?: string;
  steps: AgentStepInfo[];
  totalSteps: number;
  finishReason: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Callbacks for agent lifecycle events
 */
export interface AgentCallbacks {
  /** Called when text is streamed */
  onToken?: (token: string) => void;
  /** Called when reasoning is streamed */
  onReasoning?: (token: string) => void;
  /** Called when a step starts (before LLM call) */
  onStepStart?: (stepNumber: number) => void;
  /** Called when a step finishes (after LLM call and tool executions) */
  onStepFinish?: (step: AgentStepInfo) => void;
  /** Called when the agent starts (before first LLM call) */
  onStart?: () => void;
  /** Called when the agent finishes (after all steps complete) */
  onFinish?: (result: AgentRunResult) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /**
   * Called when a tool with needsApproval=true is about to execute.
   * Return approved=true to allow execution, approved=false to reject.
   * If rejected, the tool will return an error message to the LLM.
   */
  onToolApproval?: (toolCall: ToolCallInfo) => Promise<ToolApprovalResponse>;
  /** Called when a tool call starts (before tool execution) */
  onToolCallStart?: (toolCall: ToolCallInfo) => void;
  /** Called when a tool call finishes (after tool execution, with result or error) */
  onToolCallFinish?: (toolCall: ToolCallInfo, result: unknown) => void;
}

/**
 * Agent input message
 */
export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Options for running the agent
 */
export interface AgentRunOptions extends AgentCallbacks {
  /** The task/prompt to execute */
  prompt: string;
  /** Optional conversation history */
  messages?: AgentMessage[];
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

  /** Run result (available after completion) */
  result: AgentRunResult | null = null;

  /** Error message (if status is "error") */
  error = "";

  // ============================================================================
  // Internal State
  // ============================================================================

  private config: AgentConfig;
  model: LanguageModel;
  sandbox: Sandbox | null = null;
  tools: Tools | null = null;
  private initialized = false;

  /** Pending approval resolver for tool approval workflow */
  private pendingApprovalResolver: ((approved: boolean, reason?: string) => void) | null = null;

  /** Context for tracking runs, messages, tools, and token usage */
  readonly context: AgentContext;

  /** Manager for sandbox instances */
  private readonly sandboxManager: SandboxManager;

  /** Manager for tool instances */
  private readonly toolsManager: ToolsManager;

  constructor(
    config: AgentConfig,
    setUp: (item: Agent) => Agent,
    agentId?: string,
    managers?: { sandbox?: SandboxManager; tools?: ToolsManager }
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

    return setUp(this);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the agent (sandbox and tools)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.status = "initializing";

    try {
      // Set environment if specified
      if (this.config.environment) {
        this.sandboxManager.setEnvironment(this.config.environment);
      }

      // Initialize sandbox
      this.sandbox = await this.sandboxManager.getSandbox(this.config.rootPath);

      // Initialize tools
      this.tools = await this.toolsManager.getTools(this.config.rootPath);

      this.initialized = true;
      this.status = "idle";
    } catch (err) {
      this.error = `Failed to initialize: ${(err as Error).message}`;
      this.status = "error";
      throw err;
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
  // Tool Approval
  // ============================================================================

  /**
   * Approve pending tool call
   */
  approveToolCall(): void {
    if (!this.pendingApprovalResolver) return;
    this.pendingApprovalResolver(true);
    this.pendingApprovalResolver = null;
    this.status = "running";
  }

  /**
   * Reject pending tool call
   */
  rejectToolCall(reason = "User denied the operation"): void {
    if (!this.pendingApprovalResolver) return;
    this.pendingApprovalResolver(false, reason);
    this.pendingApprovalResolver = null;
    this.status = "running";
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
   * Wrap tools with approval logic if onToolApproval callback is provided.
   * Tools with needsApproval=true will call the approval callback before executing.
   */
  private wrapToolsWithApproval(tools: ToolSet, onToolApproval?: AgentCallbacks["onToolApproval"]): ToolSet {
    if (!onToolApproval) return tools;

    const wrappedTools: ToolSet = {};

    for (const [name, tool] of Object.entries(tools)) {
      // Check if tool needs approval
      const needsApproval = "needsApproval" in tool && tool.needsApproval === true;

      if (needsApproval && "execute" in tool && typeof tool.execute === "function") {
        // Create a wrapped version with approval check
        const originalExecute = tool.execute as (args: unknown, options: unknown) => Promise<unknown>;
        wrappedTools[name] = {
          ...tool,
          execute: async (args: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
            // Extract toolCallId from execution options (provided by AI SDK)
            const { toolCallId } = options;

            // Create tool call info for approval using the real toolCallId from LLM
            const toolCallInfo: ToolCallInfo = {
              toolCallId,
              toolName: name,
              args: args as Record<string, unknown>,
            };

            // Mark tool as needing approval in context
            const existingTool = this.context.findToolCall(toolCallId);
            if (existingTool) {
              existingTool.status = "need-approve";
            }

            // Request approval
            const response = await onToolApproval(toolCallInfo);

            if (!response.approved) {
              // Track rejection in context
              this.context.rejectTool(toolCallId, response.reason);
              // Return rejection message to LLM
              const reason = response.reason ?? "Tool execution was denied by user";
              throw new Error(`Tool "${name}" execution denied: ${reason}`);
            }

            // Track approval in context
            this.context.approveTool(toolCallId);

            // Execute the original tool
            return originalExecute(args, options);
          },
        } as (typeof tools)[string];
      } else {
        wrappedTools[name] = tool;
      }
    }

    return wrappedTools;
  }

  /**
   * Build messages array from prompt and history
   */
  private buildMessages(prompt: string, history?: AgentMessage[]): AgentMessage[] {
    const messages: AgentMessage[] = [];

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      messages.push({
        role: "system",
        content: this.config.systemPrompt,
      });
    }

    // Add conversation history
    if (history && history.length > 0) {
      messages.push(...history);
    }

    // Add current prompt
    messages.push({
      role: "user",
      content: prompt,
    });

    return messages;
  }

  /**
   * Extract usage info from AI SDK usage object
   */
  private extractUsage(
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
  ): AgentStepInfo["usage"] | undefined {
    if (!usage) return undefined;
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    };
  }

  /**
   * Aggregate usage across all steps
   */
  private aggregateUsage(steps: AgentStepInfo[]): AgentStepInfo["usage"] | undefined {
    const stepsWithUsage = steps.filter((s) => s.usage);
    if (stepsWithUsage.length === 0) return undefined;

    return {
      inputTokens: stepsWithUsage.reduce((sum, s) => sum + (s.usage?.inputTokens ?? 0), 0),
      outputTokens: stepsWithUsage.reduce((sum, s) => sum + (s.usage?.outputTokens ?? 0), 0),
      totalTokens: stepsWithUsage.reduce((sum, s) => sum + (s.usage?.totalTokens ?? 0), 0),
    };
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

  /**
   * Create tool approval handler that updates agent status
   */
  private createToolApprovalHandler(): (toolCall: ToolCallInfo) => Promise<ToolApprovalResponse> {
    return (toolCall: ToolCallInfo) => {
      return new Promise<ToolApprovalResponse>((resolve) => {
        this.pendingApprovalResolver = (approved, reason) => {
          resolve({
            toolCallId: toolCall.toolCallId,
            approved,
            reason,
          });
        };
        this.status = "waiting_approval";
      });
    };
  }

  // ============================================================================
  // Run Methods
  // ============================================================================

  /**
   * Run the agent with streaming
   */
  async runStream(options: AgentRunOptions): Promise<AgentRunResult> {
    await this.initialize();

    const {
      prompt,
      messages: history,
      additionalTools,
      maxSteps = this.config.maxSteps ?? 10,
      abortSignal,
      onToken,
      onReasoning,
      onStepStart,
      onStepFinish,
      onStart,
      onFinish,
      onError,
      onToolApproval,
      onToolCallStart,
      onToolCallFinish,
    } = options;

    // Reset state for new run
    this.status = "running";
    this.result = null;
    this.error = "";
    this.pendingApprovalResolver = null;

    const mergedTools = this.mergeTools(additionalTools);
    // Use provided onToolApproval or create default that updates agent status
    const approvalHandler = onToolApproval ?? this.createToolApprovalHandler();
    const tools = this.wrapToolsWithApproval(mergedTools, approvalHandler);
    const messages = this.buildMessages(prompt, history);
    const steps: AgentStepInfo[] = [];
    let currentStep = 0;
    let fullText = "";
    let fullReasoning = "";

    // Start run in context (this also creates the user message)
    this.context.startRun(prompt);

    try {
      onStart?.();

      const result = streamText({
        model: this.model,
        messages,
        tools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal,
        experimental_onStepStart: () => {
          currentStep++;
          // Start new assistant message for this step
          this.context.startAssistantMessage();
          onStepStart?.(currentStep);
        },
        experimental_onToolCallStart: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);
          // Add tool call to current assistant message
          this.context.addToolCall({
            id: toolCallInfo.toolCallId,
            name: toolCallInfo.toolName,
            args: toolCallInfo.args,
          });
          this.context.startTool(toolCallInfo.toolCallId);
          onToolCallStart?.(toolCallInfo);
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
          onToolCallFinish?.(toolCallInfo, toolResult);
        },
        onStepFinish: (event) => {
          const stepUsage = this.extractUsage(event.usage);
          const stepInfo: AgentStepInfo = {
            stepNumber: currentStep,
            text: event.text ?? "",
            reasoning: event.reasoningText,
            toolCalls: event.toolCalls?.map((tc) => this.toToolCallInfo(tc)) ?? [],
            toolResults:
              event.toolResults?.map((tr) => ({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                result: "result" in tr ? tr.result : undefined,
              })) ?? [],
            finishReason: event.finishReason ?? "unknown",
            usage: stepUsage,
          };

          // Update usage in context per step
          if (stepUsage) {
            this.context.updateUsage(stepUsage);
          }

          steps.push(stepInfo);
          this.context.completeAssistantMessage();
          onStepFinish?.(stepInfo);
        },
      });

      // Process fullStream to handle both text and reasoning in one pass
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          fullText += part.text;
          this.context.appendText(part.text);
          onToken?.(part.text);
        } else if (part.type === "reasoning-delta") {
          fullReasoning += part.text;
          this.context.appendReasoning(part.text);
          onReasoning?.(part.text);
        }
      }

      // Get final values
      const finalFinishReason = await result.finishReason;
      const finalReasoning = await result.reasoningText;

      const runResult: AgentRunResult = {
        text: fullText,
        reasoning: finalReasoning ?? (fullReasoning || undefined),
        steps,
        totalSteps: steps.length,
        finishReason: finalFinishReason ?? "unknown",
        usage: this.aggregateUsage(steps),
      };

      // Complete run in context
      this.context.completeRun(runResult.usage);

      // Update agent state
      this.result = runResult;
      this.status = "completed";

      onFinish?.(runResult);
      return runResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.context.errorRun(err.message);
      this.error = err.message;
      this.status = "error";
      onError?.(err);
      throw err;
    }
  }

  /**
   * Run the agent without streaming (simpler, returns full result)
   */
  async runGenerate(options: AgentRunOptions): Promise<AgentRunResult> {
    await this.initialize();

    const {
      prompt,
      messages: history,
      additionalTools,
      maxSteps = this.config.maxSteps ?? 10,
      abortSignal,
      onStepStart,
      onStepFinish,
      onStart,
      onFinish,
      onError,
      onToolApproval,
      onToolCallStart,
      onToolCallFinish,
    } = options;

    // Reset state for new run
    this.status = "running";
    this.result = null;
    this.error = "";
    this.pendingApprovalResolver = null;

    const mergedTools = this.mergeTools(additionalTools);
    const approvalHandler = onToolApproval ?? this.createToolApprovalHandler();
    const tools = this.wrapToolsWithApproval(mergedTools, approvalHandler);
    const messages = this.buildMessages(prompt, history);
    const steps: AgentStepInfo[] = [];
    let currentStep = 0;

    // Start run in context (this also creates the user message)
    this.context.startRun(prompt);

    try {
      onStart?.();

      const result = await generateText({
        model: this.model,
        messages,
        tools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal,
        experimental_onStepStart: () => {
          currentStep++;
          this.context.startAssistantMessage();
          onStepStart?.(currentStep);
        },
        experimental_onToolCallStart: (event) => {
          const toolCallInfo = this.toToolCallInfo(event.toolCall);
          this.context.addToolCall({
            id: toolCallInfo.toolCallId,
            name: toolCallInfo.toolName,
            args: toolCallInfo.args,
          });
          this.context.startTool(toolCallInfo.toolCallId);
          onToolCallStart?.(toolCallInfo);
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
          onToolCallFinish?.(toolCallInfo, toolResult);
        },
        onStepFinish: (event) => {
          const stepUsage = this.extractUsage(event.usage);
          const stepInfo: AgentStepInfo = {
            stepNumber: currentStep,
            text: event.text ?? "",
            reasoning: event.reasoningText,
            toolCalls: event.toolCalls?.map((tc) => this.toToolCallInfo(tc)) ?? [],
            toolResults:
              event.toolResults?.map((tr) => ({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                result: "result" in tr ? tr.result : undefined,
              })) ?? [],
            finishReason: event.finishReason ?? "unknown",
            usage: stepUsage,
          };

          // Update text in context
          if (event.text) {
            this.context.setText(event.text);
          }

          // Update usage per step
          if (stepUsage) {
            this.context.updateUsage(stepUsage);
          }

          steps.push(stepInfo);
          this.context.completeAssistantMessage();
          onStepFinish?.(stepInfo);
        },
      });

      const runResult: AgentRunResult = {
        text: result.text ?? "",
        reasoning: result.reasoningText,
        steps,
        totalSteps: steps.length,
        finishReason: result.finishReason ?? "unknown",
        usage: this.aggregateUsage(steps),
      };

      // Complete run in context
      this.context.completeRun(runResult.usage);

      // Update agent state
      this.result = runResult;
      this.status = "completed";

      onFinish?.(runResult);
      return runResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.context.errorRun(err.message);
      this.error = err.message;
      this.status = "error";
      onError?.(err);
      throw err;
    }
  }

  /**
   * Run the agent (auto-selects streaming based on options)
   */
  async run(options: AgentRunOptions): Promise<AgentRunResult> {
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
    this.result = null;
    this.error = "";
  }

  /**
   * Reset agent state (keeps agent initialized)
   */
  reset(): void {
    this.status = "idle";
    this.result = null;
    this.error = "";
    this.pendingApprovalResolver = null;
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
  setUp: (i: Agent) => Agent;
  /** Optional agent ID (auto-generated if not provided) */
  agentId?: string;
  /** Optional custom managers (defaults to singletons) */
  managers?: {
    sandbox?: SandboxManager;
    tools?: ToolsManager;
  };
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
  const agent = new Agent(config, setUp, agentId, managers);
  await agent.initialize();
  return agent;
}
