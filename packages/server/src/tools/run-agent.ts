import { tool, z } from "@cyanheads/mcp-ts-core";
import { agentManager, createModel, runSubagent } from "@my-agent/core";

import type { ProviderType } from "@my-agent/core";

// ============================================================================
// Agent Setup
// ============================================================================

/** Lazy-initialized parent agent ID */
let parentAgentId: string | null = null;

/**
 * Ensure a parent agent exists for subagent delegation.
 * Created once on first tool call, reused across requests.
 */
async function ensureParentAgent(): Promise<string> {
  if (parentAgentId) {
    const existing = agentManager.getAgent(parentAgentId);
    if (existing) return parentAgentId;
  }

  const provider = (process.env.PROVIDER || "ollama") as ProviderType;
  const model = process.env.MODEL || "qwen3";
  const apiKey = process.env.API_KEY;
  const rootPath = process.env.ROOT_PATH || process.cwd();

  const languageModel = createModel({
    type: provider,
    model,
    apiKey,
  });

  const agent = await agentManager.createManagedAgent({
    languageModel,
    model,
    rootPath,
    name: "mcp-server-agent",
    systemPrompt:
      "You are a helpful coding assistant. You can read, write, and modify files, run commands, and help with programming tasks.",
    maxIterations: 30,
  });

  parentAgentId = agent.id;
  return parentAgentId;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const runAgentTool = tool("run_agent", {
  description:
    "Run an AI agent to complete a task. The agent has access to file operations, command execution, and code exploration tools.",
  input: z.object({
    prompt: z.string().describe("The task or question for the agent to handle"),
    maxIterations: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum iterations for the agent loop (default: 30)"),
  }),
  output: z.object({
    result: z.string().describe("The agent's response"),
    iterations: z.number().describe("Number of iterations used"),
    truncated: z.boolean().describe("Whether the output was truncated"),
  }),
  annotations: {
    title: "Run Agent",
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  async handler(input) {
    const agentId = await ensureParentAgent();

    const subagentResult = await runSubagent({
      prompt: input.prompt,
      parentAgentId: agentId,
      description: "mcp-task",
      maxIterations: input.maxIterations ?? 30,
    });

    return {
      result: subagentResult.output,
      iterations: subagentResult.iterations,
      truncated: subagentResult.truncated,
    };
  },
  format: (result) => [
    {
      type: "text" as const,
      text: result.result,
    },
  ],
});
