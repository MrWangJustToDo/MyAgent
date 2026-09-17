import type { ModelInfo } from "../types.js";
import type { ModelMessage } from "@tanstack/ai";

/** Join TanStack assistant `thinking` blocks into `reasoning_content`. */
export function buildReasoningContentFromThinking(thinking: ModelMessage["thinking"] | undefined): string | undefined {
  if (!thinking?.length) return undefined;
  const content = thinking.map((entry) => entry.content).join("");
  return content.length > 0 ? content : undefined;
}

/** Read `reasoning_content` from a Chat Completions stream chunk (thinking mode). */
export function extractReasoningContentFromStreamChunk(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== "object") return undefined;

  const choices = (chunk as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;

  const delta = (choices[0] as { delta?: { reasoning_content?: string | null } }).delta;
  const reasoning = delta?.reasoning_content;
  return typeof reasoning === "string" && reasoning.length > 0 ? reasoning : undefined;
}

/**
 * Whether this endpoint/model requires reasoning echo-back.
 *
 * True when the model advertises the `reasoning` capability **or** when models.dev marks it as
 * interleaving reasoning with tool calls. The second condition is not redundant: 2 of the 1083
 * entries carrying `interleaved` (`siliconflow-cn/…/MiniMax-M2.5`, `novita-ai/minimax/minimax-m2.1`)
 * declare `reasoning: false` while still naming a reasoning echo field. Reading only the capability
 * flag left those two with no echo adapter at all.
 *
 * When metadata is missing (offline, models.dev-unknown models, hosts that don't pass modelInfo) we
 * conservatively default to the reasoning adapter — it is a no-op superset of the plain adapter, so
 * unknown thinking models never silently drop their reasoning.
 */
export function shouldEchoReasoningContent(
  modelInfo?: Pick<ModelInfo, "capabilities" | "reasoningInterleaved"> | null
): boolean {
  if (!modelInfo) return true;
  return Boolean(modelInfo.capabilities?.includes("reasoning")) || modelInfo.reasoningInterleaved === true;
}
