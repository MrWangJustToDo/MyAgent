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
 * Whether this endpoint/model requires `reasoning_content` echo-back.
 *
 * A resolved model whose metadata advertises the `reasoning` capability
 * (models.dev `reasoning: true`) routes through the reasoning adapter. When
 * metadata is missing (offline, models.dev-unknown models, hosts that don't
 * pass modelInfo) we conservatively default to the reasoning adapter — it is a
 * no-op superset of the plain adapter, so unknown thinking models never
 * silently drop their reasoning.
 */
export function shouldEchoReasoningContent(modelInfo?: Pick<ModelInfo, "capabilities"> | null): boolean {
  return modelInfo?.capabilities?.includes("reasoning") ?? true;
}
