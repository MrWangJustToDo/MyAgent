/**
 * Subagent - Flexible context-isolated agent for delegated tasks.
 *
 * A generic subagent runner that can be configured for different purposes:
 * - Task exploration (read-only tools, exploration system prompt)
 * - Compaction (no tools, summarization system prompt)
 * - Custom use cases (custom tools, custom system prompt)
 *
 * Features:
 * - Fresh messages=[] (context isolation)
 * - Configurable tool set (or no tools)
 * - Configurable system prompt
 * - Token usage tracking
 * - Proper parent/child tracking via AgentManager
 *
 * @example
 * ```typescript
 * // For task exploration (default)
 * const result = await runSubagent({
 *   prompt: "Find what testing framework this project uses",
 *   parentAgentId: agent.id,
 * });
 *
 * // For compaction (no tools, custom prompt)
 * const result = await runSubagent({
 *   prompt: conversationText,
 *   parentAgentId: agent.id,
 *   systemPrompt: COMPACTION_PROMPT,
 *   tools: {}, // No tools
 *   maxIterations: 1, // Single pass
 *   description: "compaction",
 * });
 * ```
 */

import { generateId } from "../../base/utils.js";
import { agentManager, type AgentManager } from "../../managers/manager-agent.js";
import { createGlobTool } from "../tools/glob-tool.js";
import { createGrepTool } from "../tools/grep-tool.js";
import { createListFileTool } from "../tools/list-file-tool.js";
import { createReadFileTool } from "../tools/read-file-tool.js";
import { createTreeTool } from "../tools/tree-tool.js";
import { maybeCacheOutput } from "../tools/util/tool-output-cache.js";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context/agent-context.js";
import type { ModelMessage, ToolSet } from "ai";

// ============================================================================
// Constants
// ============================================================================

/** Default maximum iterations for subagent loop */
export const SUBAGENT_DEFAULT_MAX_ITERATIONS = 30;

/** Default maximum characters for output (truncation limit) */
export const SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH = 5000;

/** Maximum retries when output is empty */
export const SUBAGENT_MAX_RETRIES = 2;

/** @deprecated Use SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH instead */
export const SUBAGENT_MAX_SUMMARY_LENGTH = SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH;

/** Build the default system prompt for task exploration subagents. */
export function buildExploreSystemPrompt(maxIterations: number = SUBAGENT_DEFAULT_MAX_ITERATIONS): string {
  return `You are a subagent with READ-ONLY access to the codebase.

Your role:
- Complete the delegated task thoroughly
- Use available tools to explore and gather information

Constraints:
- You have read-only tools only (read_file, glob, grep, list_file, tree)
- You cannot modify files or create new files
- You cannot spawn additional subagents
- Focus on answering the specific question or completing the specific task
- Do not run more than ${maxIterations} steps — complete the task efficiently without excessive tool calls

IMPORTANT: Only your final text response is returned to the parent agent as the task result.
You MUST end with a comprehensive text summary — never end on a tool call.
Your last message must be a complete, standalone answer to the task.`;
}

/** Default system prompt (with default max iterations). */
export const SUBAGENT_EXPLORE_SYSTEM_PROMPT = buildExploreSystemPrompt();

/** @deprecated Use buildExploreSystemPrompt() instead */
export const SUBAGENT_SYSTEM_PROMPT = SUBAGENT_EXPLORE_SYSTEM_PROMPT;

// ============================================================================
// Types
// ============================================================================

export interface SubagentConfig {
  /** Optional custom ID for the subagent (auto-generated if not provided) */
  subagentId?: string;
  /** The prompt/task for the subagent to complete */
  prompt: string;
  /** Short description for UI display (default: "subtask") */
  description?: string;
  /** Parent agent ID (to get agent instance from AgentManager) */
  parentAgentId: string;
  /** Custom system prompt (default: SUBAGENT_EXPLORE_SYSTEM_PROMPT) */
  systemPrompt?: string;
  /** Custom tools (default: read-only exploration tools, pass {} for no tools) */
  tools?: ToolSet;
  /** Maximum iterations (default: 30) */
  maxIterations?: number;
  /** Maximum retry (default: 2) */
  maxRetried?: number;
  /** Maximum output length before truncation (default: 5000) */
  maxOutputLength?: number;
  /** Retry prompt when output is empty (default: asks for summary) */
  // retryPrompt?: string;
  /** Whether to retry when output is empty (default: true) */
  retryOnEmpty?: boolean;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Auto-destroy subagent after completion (default: true) */
  autoDestroy?: boolean;
  /** Whether to aggregate usage to parent context (default: true) */
  aggregateUsageToParent?: boolean;
  /**
   * Initial messages to seed the subagent's context.
   * If provided, these are used instead of starting from empty.
   * Useful for compaction where you want to pass conversation history.
   */
  initialMessages?: ModelMessage[];
}

export interface SubagentResult {
  /** Subagent ID - use to get instance via agentManager.getAgent(subagentId) */
  subagentId: string;
  /** Final output text (may be truncated; full output at cachedOutputPath) */
  output: string;
  /** Whether the output was truncated */
  truncated: boolean;
  /** Number of iterations used */
  iterations: number;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Whether iteration limit was reached */
  reachedLimit: boolean;
  /** Number of retries attempted */
  retries: number;
  /** Path to cached full output on disk (null if output wasn't large enough to cache) */
  cachedOutputPath: string | null;
}

/** @deprecated Use SubagentResult.output instead of summary */
export type SubagentResultLegacy = SubagentResult & { summary: string };

// ============================================================================
// Read-Only Tool Set
// ============================================================================

/**
 * Creates the restricted read-only tool set for exploration subagents.
 * These tools allow exploration but not modification.
 */
export const createSubagentTools = (sandbox: Sandbox, context?: AgentContext): ToolSet => {
  return {
    read_file: createReadFileTool({ sandbox, context }),
    glob: createGlobTool({ sandbox }),
    grep: createGrepTool({ sandbox }),
    list_file: createListFileTool({ sandbox }),
    tree: createTreeTool({ sandbox }),
  };
};

/** Alias for backward compatibility */
export const createExploreTools = createSubagentTools;

// ============================================================================
// Summary Extraction
// ============================================================================

/**
 * Extracts the summary from generateText result.
 *
 * The system prompt instructs the LLM to always end with a text summary,
 * so result.text should normally be sufficient. This is a safety net for
 * edge cases where the LLM ends on a tool call — we walk backward to find
 * the last step that finished with text output.
 */
export const extractSummary = (result: {
  text: string;
  steps?: Array<{ text?: string; finishReason?: string }>;
}): string => {
  if (result.steps && result.steps.length > 1) {
    // Walk backward to find the last step that ended with text output, not a tool call
    for (let i = result.steps.length - 1; i >= 0; i--) {
      const step = result.steps[i];
      if (step.finishReason !== "tool-calls" && step.text?.trim()) {
        return step.text.trim();
      }
    }
  }
  return result.text?.trim() || "(no summary)";
};

/**
 * Truncates summary to max length with notice.
 */
export const truncateSummary = (
  summary: string,
  maxLength: number = SUBAGENT_MAX_SUMMARY_LENGTH
): { summary: string; truncated: boolean } => {
  if (summary.length <= maxLength) {
    return { summary, truncated: false };
  }

  const truncated = summary.slice(0, maxLength);
  const notice = `\n\n[Summary truncated at ${maxLength} characters]`;

  return {
    summary: truncated + notice,
    truncated: true,
  };
};

// ============================================================================
// Main Function
// ============================================================================

/**
 * Runs a subagent with fresh context to complete a delegated task.
 *
 * Uses AgentManager to spawn a proper subagent with:
 * 1. Parent/child relationship tracking
 * 2. Fresh context (empty messages)
 * 3. Configurable tools (default: read-only exploration tools)
 * 4. Configurable system prompt (default: exploration prompt)
 * 5. Accessible via agentManager.getAgent(subagentId)
 *
 * @param config - Subagent configuration
 * @returns SubagentResult with subagentId, output and metadata
 */
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    systemPrompt: customSystemPrompt,
    tools: customTools,
    maxIterations = SUBAGENT_DEFAULT_MAX_ITERATIONS,
    maxRetried = SUBAGENT_MAX_RETRIES,
    maxOutputLength = SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH,
    retryOnEmpty = true,
    abortSignal,
    autoDestroy = true,
    aggregateUsageToParent = true,
    initialMessages,
  } = config;

  // Build system prompt: use custom if provided, otherwise generate with actual maxIterations
  const systemPrompt = customSystemPrompt ?? buildExploreSystemPrompt(maxIterations);

  // Generate or use custom subagent ID
  const subagentId = customId ?? generateId("subagent");

  // Get parent managed agent from AgentManager
  const parentManagedAgent = agentManager.getAgent(parentAgentId);
  if (!parentManagedAgent) {
    throw new Error(`Parent agent not found: ${parentAgentId}`);
  }

  const { agent: parentAgent, sandbox } = parentManagedAgent;

  // Get resources from parent agent
  const parentContext = parentAgent.getContext();
  const parentLog = parentAgent.getLog();

  parentLog?.info("agent", `Starting subagent: ${description}`, { systemPrompt, subagentId, prompt, initialMessages });

  // Track iterations and usage
  let iterations = 0;
  let reachedLimit = false;
  let retries = 0;
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };

  // Spawn subagent via AgentManager (creates parent/child relationship)
  // Inherits model, languageModel, rootPath from parent config
  const subagent = await agentManager.spawnSubagent(parentAgentId, {
    id: subagentId,
    name: `subagent-${description}`,
    systemPrompt,
    maxIterations,
  });

  // Set tools - use custom tools if provided, otherwise use read-only exploration tools.
  // Always clear customTools added by createManagedAgent (todo, webfetch, websearch)
  // since subagents should only have their explicitly configured tool set.
  const subagentContext = subagent.getContext() ?? undefined;
  const subagentTools = customTools !== undefined ? customTools : createSubagentTools(sandbox, subagentContext);
  subagent.setTools(subagentTools);
  subagent.customTools = {};

  // Emit subagent:created event
  agentManager.emit({
    type: "subagent:created",
    subagentId,
    parentId: parentAgentId,
    agent: subagent,
  });

  // Helper to track step progress
  const onStepFinish = (event: {
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
      outputTokenDetails?: { reasoningTokens?: number };
    };
    finishReason?: string;
  }) => {
    iterations++;
    const { usage: stepUsage, finishReason } = event;

    if (stepUsage) {
      usage.inputTokens += stepUsage.inputTokens ?? 0;
      usage.outputTokens += stepUsage.outputTokens ?? 0;
      usage.totalTokens += (stepUsage.inputTokens ?? 0) + (stepUsage.outputTokens ?? 0);
      usage.cacheReadTokens += stepUsage.inputTokenDetails?.cacheReadTokens ?? 0;
      usage.cacheWriteTokens += stepUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
      usage.reasoningTokens += stepUsage.outputTokenDetails?.reasoningTokens ?? 0;
    }

    parentLog?.debug("agent", `Subagent step ${iterations}`, { subagentId, finishReason });

    // Emit subagent:step event
    agentManager.emit({
      type: "subagent:step",
      subagentId,
      parentId: parentAgentId,
      agent: subagent,
      data: { step: iterations, finishReason },
    });

    // Check if we hit the limit
    if (iterations >= maxIterations) {
      reachedLimit = true;
    }
  };

  try {
    while (true) {
      if (retries > maxRetried) {
        throw new Error("max retry for current task");
      }

      subagent.todoManager?.reset();
      subagent.context?.reset();
      subagent.context?.resetUsage();

      // Emit subagent:started event
      agentManager.emit({
        type: "subagent:started",
        subagentId,
        parentId: parentAgentId,
        agent: subagent,
      });

      retries++;

      // reset step
      iterations = 0;

      // Run subagent - context was pre-seeded with initialMessages if provided
      // The prompt becomes the final user message
      // break the type, but current flow is ok, we will compact the message in prepareMessagesAsync function
      try {
        const result = await subagent.generate({
          prompt,
          messages: initialMessages || [],
          abortSignal,
          onStepFinish,
        });

        // Extract output from result
        const rawOutput = extractSummary(result);

        // Aggregate usage to parent's context
        if (aggregateUsageToParent && parentContext) {
          parentContext.addTotalUsage(usage);
        }

        if (retryOnEmpty && (!rawOutput || rawOutput === "(no summary)")) {
          parentLog?.warn("agent", "Subagent output empty", {
            subagentId,
            retries,
          });

          continue;
        }

        // Cache full output to disk when it's large, so the parent agent
        // can read_file the complete result via the cached path.
        // If cached, use the preview (head+tail with read_file hint) as output.
        // Otherwise fall back to truncateSummary for moderate-length output.
        let output: string;
        let truncated: boolean;
        let cachedOutputPath: string | null = null;

        if (sandbox) {
          const cached = await maybeCacheOutput(sandbox, rawOutput, `${subagentId}-task`);
          cachedOutputPath = cached.cachedOutputPath;
          if (cachedOutputPath) {
            output = cached.content;
            truncated = true;
          } else {
            ({ summary: output, truncated } = truncateSummary(rawOutput, maxOutputLength));
          }
        } else {
          ({ summary: output, truncated } = truncateSummary(rawOutput, maxOutputLength));
        }

        parentLog?.info("agent", "Subagent completed", {
          subagentId,
          iterations,
          reachedLimit,
          outputLength: output.length,
          truncated,
          cachedOutputPath,
          usage,
          output,
        });

        // Emit subagent:completed event
        agentManager.emit({
          type: "subagent:completed",
          subagentId,
          parentId: parentAgentId,
          agent: subagent,
          data: { summary: output, iterations },
        });

        return {
          subagentId,
          output,
          truncated,
          iterations,
          usage,
          reachedLimit,
          retries,
          cachedOutputPath,
        };
      } catch (error) {
        parentLog?.error("agent", "Subagent error", error as Error);

        // Emit subagent:error event
        agentManager.emit({
          type: "subagent:error",
          subagentId,
          parentId: parentAgentId,
          agent: subagent,
          data: { error: error instanceof Error ? error : new Error(String(error)) },
        });

        return {
          subagentId,
          output: (error as Error)?.message || "Unknown error",
          truncated: false,
          iterations: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          reachedLimit: false,
          retries: retries,
          cachedOutputPath: null,
        };
      }
    }
  } finally {
    // Emit subagent:destroyed event before cleanup
    if (autoDestroy) {
      agentManager.emit({
        type: "subagent:destroyed",
        subagentId,
        parentId: parentAgentId,
        agent: subagent,
      });
      agentManager.destroyAgent(subagentId);
    }
  }
}

/**
 * Get a subagent instance by ID.
 *
 * @param agentManager - The agent manager
 * @param subagentId - The subagent ID
 * @returns The subagent's ManagedAgent or undefined if not found
 */
export function getSubagent(agentManager: AgentManager, subagentId: string) {
  return agentManager.getAgent(subagentId);
}

/**
 * Destroy a subagent by ID.
 *
 * @param agentManager - The agent manager
 * @param subagentId - The subagent ID to destroy
 */
export function destroySubagent(agentManager: AgentManager, subagentId: string) {
  agentManager.destroyAgent(subagentId);
}
