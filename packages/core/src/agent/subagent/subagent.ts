/**
 * Subagent - Context-isolated agent for delegated tasks.
 *
 * Uses Agent + AgentManager for proper lifecycle management:
 * - Fresh messages=[] (context isolation)
 * - Restricted read-only tool set
 * - Specialized system prompt
 * - Summary-only return to parent
 * - Proper parent/child tracking via AgentManager
 * - Subagent instance accessible via AgentManager.getAgent(subagentId)
 *
 * @example
 * ```typescript
 * const result = await runSubagent({
 *   prompt: "Find what testing framework this project uses",
 *   parentAgentId: agent.id,
 *   agentManager: manager,
 * });
 *
 * // Access subagent instance if needed
 * const subagent = manager.getAgent(result.subagentId);
 *
 * // Clean up when done
 * manager.destroyAgent(result.subagentId);
 * ```
 */

import { generateId } from "../../base/utils.js";
import { createGlobTool } from "../tools/glob-tool.js";
import { createGrepTool } from "../tools/grep-tool.js";
import { createListFileTool } from "../tools/list-file-tool.js";
import { createReadFileTool } from "../tools/read-file-tool.js";
import { createRunCommandTool } from "../tools/run-command-tool.js";
import { createTreeTool } from "../tools/tree-tool.js";

import type { Sandbox } from "../../environment";
import type { AgentManager } from "../../managers/manager-agent.js";
import type { ToolSet } from "ai";

// ============================================================================
// Constants
// ============================================================================

/** Maximum iterations for subagent loop (safety limit) */
export const SUBAGENT_MAX_ITERATIONS = 30;

/** Maximum characters for summary (truncation limit) */
export const SUBAGENT_MAX_SUMMARY_LENGTH = 5000;

/** System prompt for subagents */
export const SUBAGENT_SYSTEM_PROMPT = `You are a subagent with READ-ONLY access to the codebase.

Your role:
- Complete the delegated task thoroughly
- Use available tools to explore and gather information
- Summarize your findings clearly and concisely

Constraints:
- You have read-only tools only (read_file, glob, grep, run_command, list_file, tree)
- You cannot modify files or create new files
- You cannot spawn additional subagents
- Focus on answering the specific question or completing the specific task

When done, provide a clear summary of what you found or accomplished.`;

// ============================================================================
// Types
// ============================================================================

export interface SubagentConfig {
  /** Optional custom ID for the subagent (auto-generated if not provided) */
  subagentId?: string;
  /** The prompt/task for the subagent to complete */
  prompt: string;
  /** Short description for UI display */
  description?: string;
  /** Parent agent ID (to get agent instance from AgentManager) */
  parentAgentId: string;
  /** Agent manager for spawning and lifecycle management */
  agentManager: AgentManager;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Auto-destroy subagent after completion (default: true) */
  autoDestroy?: boolean;
}

export interface SubagentResult {
  /** Subagent ID - use to get instance via agentManager.getAgent(subagentId) */
  subagentId: string;
  /** Final summary text */
  summary: string;
  /** Whether the summary was truncated */
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
}

// ============================================================================
// Read-Only Tool Set
// ============================================================================

/**
 * Creates the restricted read-only tool set for subagents.
 * These tools allow exploration but not modification.
 */
export const createSubagentTools = (sandbox: Sandbox): ToolSet => {
  return {
    read_file: createReadFileTool({ sandbox }),
    glob: createGlobTool({ sandbox }),
    grep: createGrepTool({ sandbox }),
    run_command: createRunCommandTool({ sandbox }),
    list_file: createListFileTool({ sandbox }),
    tree: createTreeTool({ sandbox }),
  };
};

// ============================================================================
// Summary Extraction
// ============================================================================

/**
 * Extracts the final text content from generateText result.
 */
export const extractSummary = (text: string | undefined): string => {
  return text?.trim() || "(no summary)";
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
 * 3. Read-only tools only
 * 4. Subagent system prompt
 * 5. Accessible via agentManager.getAgent(subagentId)
 *
 * @param config - Subagent configuration
 * @returns SubagentResult with subagentId, summary and metadata
 */
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    agentManager,
    abortSignal,
    autoDestroy = true,
  } = config;

  // Generate or use custom subagent ID
  const subagentId = customId ?? generateId("subagent");

  // Get parent managed agent from AgentManager
  const parentManagedAgent = agentManager.getAgent(parentAgentId);
  if (!parentManagedAgent) {
    throw new Error(`Parent agent not found: ${parentAgentId}`);
  }

  const { agent: parentAgent, sandbox, config: managedConfig } = parentManagedAgent;
  const rootPath = managedConfig.rootPath;

  // Get resources from parent agent
  const model = parentAgent.getModel();
  const parentContext = parentAgent.getContext();
  const parentLog = parentAgent.getLog();
  const parentConfig = parentAgent.getConfig();

  if (!model) {
    throw new Error("Parent agent has no model set");
  }

  parentLog?.info("agent", `Starting subagent: ${description}`, { subagentId, prompt });

  // Track iterations and usage
  let iterations = 0;
  let reachedLimit = false;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  // Spawn subagent via AgentManager (creates parent/child relationship)
  const subagent = await agentManager.spawnSubagent(parentAgentId, {
    id: subagentId,
    name: `subagent-${description}`,
    rootPath,
    languageModel: model,
    model: parentConfig.model,
    systemPrompt: SUBAGENT_SYSTEM_PROMPT,
    maxIterations: SUBAGENT_MAX_ITERATIONS,
    maxTokens: parentConfig.maxTokens,
    temperature: parentConfig.temperature,
  });

  // Override tools with read-only set (subagent was created with full tools by AgentManager)
  const readOnlyTools = createSubagentTools(sandbox);
  subagent.setTools(readOnlyTools);

  // Emit subagent:created event
  agentManager.emit({
    type: "subagent:created",
    subagentId,
    parentId: parentAgentId,
    agent: subagent,
  });

  try {
    // Emit subagent:started event
    agentManager.emit({
      type: "subagent:started",
      subagentId,
      parentId: parentAgentId,
      agent: subagent,
    });

    // Run subagent with fresh context using Agent.generate()
    const result = await subagent.generate({
      prompt, // Fresh prompt, no message history
      abortSignal,
      onStepFinish: (event) => {
        iterations++;
        const { usage: stepUsage, finishReason } = event;

        // Accumulate usage
        if (stepUsage) {
          usage.inputTokens += stepUsage.inputTokens ?? 0;
          usage.outputTokens += stepUsage.outputTokens ?? 0;
          usage.totalTokens += (stepUsage.inputTokens ?? 0) + (stepUsage.outputTokens ?? 0);
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
        if (iterations >= SUBAGENT_MAX_ITERATIONS) {
          reachedLimit = true;
        }
      },
    });

    // Extract final summary
    const rawSummary = extractSummary(result.text);

    // Truncate if needed
    const { summary, truncated } = truncateSummary(rawSummary);

    parentLog?.info("agent", "Subagent completed", {
      subagentId,
      iterations,
      reachedLimit,
      summaryLength: summary.length,
      truncated,
      usage,
    });

    // Emit subagent:completed event
    agentManager.emit({
      type: "subagent:completed",
      subagentId,
      parentId: parentAgentId,
      agent: subagent,
      data: { summary, iterations },
    });

    // Aggregate usage to parent's context
    if (parentContext) {
      parentContext.updateUsage({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    }

    return {
      subagentId,
      summary,
      truncated,
      iterations,
      usage,
      reachedLimit,
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

    // Return error as summary
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      subagentId,
      summary: `Subagent error: ${errorMessage}`,
      truncated: false,
      iterations,
      usage,
      reachedLimit,
    };
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
