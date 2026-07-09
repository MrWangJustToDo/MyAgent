/**
 * Derive subagent run statistics from UI message snapshots and stream metadata.
 */

import { splitStepSegments } from "./extract-assistant-text.js";

import type { SubagentResult } from "./types.js";
import type { AgentStatus } from "../../managers/agent-types.js";
import type { StreamChunk, UIMessage } from "@tanstack/ai";

const LIMIT_FINISH_REASONS = new Set(["max-steps", "max_steps", "max-iterations", "length"]);

export interface DeriveSubagentRunStatsInput {
  messages: UIMessage[];
  maxIterations: number;
  finishReason: string | null;
  output: string;
  aborted: boolean;
  status?: AgentStatus;
}

/** Count agent-loop steps from assistant tool-call parts (TanStack UIMessage format). */
export function countSubagentIterations(messages: UIMessage[]): number {
  const toolCalls = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "tool-call").length;

  if (toolCalls > 0) return toolCalls;

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return 1;

  return Math.max(1, splitStepSegments(lastAssistant.parts).length);
}

/** Wrap a stream to capture {@link RUN_FINISHED} finish reason. */
export async function* captureStreamFinishReason(
  stream: AsyncIterable<StreamChunk>,
  onFinish: (reason: string | null) => void
): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) {
    if (chunk.type === "RUN_FINISHED") {
      const record = chunk as { finishReason?: string };
      onFinish(record.finishReason ?? null);
    }
    yield chunk;
  }
}

export function deriveSubagentRunStats(
  input: DeriveSubagentRunStatsInput
): Pick<SubagentResult, "iterations" | "reachedLimit" | "incomplete"> {
  const iterations = countSubagentIterations(input.messages);
  const finishReasonIndicatesLimit = input.finishReason != null && LIMIT_FINISH_REASONS.has(input.finishReason);
  const reachedLimit = input.maxIterations > 0 && (iterations > input.maxIterations || finishReasonIndicatesLimit);

  const hasSummary = input.output.trim().length > 0 && input.output !== "(no summary)";
  const incomplete = !input.aborted && !hasSummary && (reachedLimit || input.status === "error");

  return {
    iterations: Math.max(iterations, 1),
    reachedLimit,
    incomplete,
  };
}
