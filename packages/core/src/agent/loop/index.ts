/* eslint-disable max-lines */
import { generateText, streamText, stepCountIs } from "ai";
import { z } from "zod";

import { type EnvironmentType } from "../../environment/types.js";
import { useSandbox } from "../../hooks/useSandbox.js";
import { useTools } from "../../hooks/useTools.js";
import { createModel } from "../../provider.js";
import { DEFAULT_OLLAMA_API_URL, type Sandbox } from "../../types.js";
import { type Tools } from "../tools";

import type { ToolSet, LanguageModel } from "ai";

// ============================================================================
// Types & Schemas
// ============================================================================

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
 * - Sandbox-based file operations
 * - Built-in tools for file manipulation, command execution, etc.
 * - Streaming support with text and reasoning callbacks
 * - Tool approval workflow for dangerous operations
 * - Step-by-step execution with callbacks
 * - Conversation history support
 */
export class Agent {
  private config: AgentConfig;
  private model: LanguageModel;
  private sandbox: Sandbox | null = null;
  private tools: Tools | null = null;
  private initialized = false;

  constructor(config: AgentConfig) {
    // Validate config (environment is validated separately)
    const { environment, ...restConfig } = config;
    this.config = { ...AgentConfigSchema.parse(restConfig), environment };
    this.model = createModel(this.config.model, this.config.baseURL ?? DEFAULT_OLLAMA_API_URL);
  }

  /**
   * Initialize the agent (sandbox and tools)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set environment if specified
    if (this.config.environment) {
      useSandbox.getActions().setEnvironment(this.config.environment);
    }

    // Initialize sandbox
    this.sandbox = await useSandbox.getActions().init(this.config.rootPath);

    // Note: Environment variables for just-bash should be set via the justBash config
    // in useSandbox.ts. The envs config option is kept for compatibility but not used
    // directly since just-bash doesn't support runtime setEnv.

    // Initialize tools
    this.tools = await useTools.getActions().init(this.config.rootPath);

    this.initialized = true;
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

            // Request approval
            const response = await onToolApproval(toolCallInfo);

            if (!response.approved) {
              // Return rejection message to LLM
              const reason = response.reason ?? "Tool execution was denied by user";
              throw new Error(`Tool "${name}" execution denied: ${reason}`);
            }

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

    const mergedTools = this.mergeTools(additionalTools);
    const tools = this.wrapToolsWithApproval(mergedTools, onToolApproval);
    const messages = this.buildMessages(prompt, history);
    const steps: AgentStepInfo[] = [];
    let currentStep = 0;
    let fullText = "";
    let fullReasoning = "";

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
          onStepStart?.(currentStep);
        },
        experimental_onToolCallStart: (event) => {
          if (onToolCallStart) {
            const toolCallInfo = this.toToolCallInfo(event.toolCall);
            onToolCallStart(toolCallInfo);
          }
        },
        experimental_onToolCallFinish: (event) => {
          if (onToolCallFinish) {
            const toolCallInfo = this.toToolCallInfo(event.toolCall);
            const result = event.success ? event.output : event.error;
            onToolCallFinish(toolCallInfo, result);
          }
        },
        onStepFinish: (event) => {
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
            usage: this.extractUsage(event.usage),
          };

          steps.push(stepInfo);
          onStepFinish?.(stepInfo);
        },
      });

      // Process fullStream to handle both text and reasoning in one pass
      // We can't consume both textStream and fullStream - they share the same underlying stream
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          fullText += part.text;
          onToken?.(part.text);
        } else if (part.type === "reasoning-delta" && onReasoning) {
          // Handle reasoning text if model supports it
          fullReasoning += part.text;
          onReasoning(part.text);
        }
      }

      // Get final values (these should be resolved after stream is consumed)
      const finalFinishReason = await result.finishReason;
      // const finalUsage = await result.usage;
      const finalReasoning = await result.reasoningText;

      const runResult: AgentRunResult = {
        text: fullText,
        reasoning: finalReasoning ?? (fullReasoning || undefined),
        steps,
        totalSteps: steps.length,
        finishReason: finalFinishReason ?? "unknown",
        // Aggregate usage across all steps for the total
        usage: this.aggregateUsage(steps),
      };

      onFinish?.(runResult);
      return runResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
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

    const mergedTools = this.mergeTools(additionalTools);
    const tools = this.wrapToolsWithApproval(mergedTools, onToolApproval);
    const messages = this.buildMessages(prompt, history);
    const steps: AgentStepInfo[] = [];
    let currentStep = 0;

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
          onStepStart?.(currentStep);
        },
        experimental_onToolCallStart: (event) => {
          if (onToolCallStart) {
            const toolCallInfo = this.toToolCallInfo(event.toolCall);
            onToolCallStart(toolCallInfo);
          }
        },
        experimental_onToolCallFinish: (event) => {
          if (onToolCallFinish) {
            const toolCallInfo = this.toToolCallInfo(event.toolCall);
            const result = event.success ? event.output : event.error;
            onToolCallFinish(toolCallInfo, result);
          }
        },
        onStepFinish: (event) => {
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
            usage: this.extractUsage(event.usage),
          };

          steps.push(stepInfo);
          onStepFinish?.(stepInfo);
        },
      });

      const runResult: AgentRunResult = {
        text: result.text ?? "",
        reasoning: result.reasoningText,
        steps,
        totalSteps: steps.length,
        finishReason: result.finishReason ?? "unknown",
        // Aggregate usage across all steps for the total
        usage: this.aggregateUsage(steps),
      };

      onFinish?.(runResult);
      return runResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
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

  /**
   * Cleanup agent resources
   */
  async destroy(): Promise<void> {
    if (this.config.rootPath) {
      await useSandbox.getActions().deleteSandbox(this.config.rootPath);
    }
    this.sandbox = null;
    this.tools = null;
    this.initialized = false;
  }

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
 * const result = await agent.run({
 *   prompt: "Create a hello world function",
 *   onToken: (token) => process.stdout.write(token),
 *   onStepFinish: (step) => console.log(`Step ${step.stepNumber} complete`),
 * });
 *
 * console.log(result.text);
 * await agent.destroy();
 * ```
 */
export async function createAgent(config: AgentConfig): Promise<Agent> {
  const agent = new Agent(config);
  await agent.initialize();
  return agent;
}

// ============================================================================
// Re-exports
// ============================================================================

export { useSandbox, useTools };
