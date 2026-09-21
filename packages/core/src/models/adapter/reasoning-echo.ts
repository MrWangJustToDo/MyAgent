import type { ModelInfo } from "../types.js";
import type { ModelMessage } from "@tanstack/ai";

/** Join TanStack assistant `thinking` blocks into `reasoning_content`. */
export function buildReasoningContentFromThinking(thinking: ModelMessage["thinking"] | undefined): string | undefined {
  if (!thinking?.length) return undefined;
  const content = thinking.map((entry) => entry.content).join("");
  return content.length > 0 ? content : undefined;
}

/**
 * Read reasoning text from a Chat Completions stream chunk (thinking mode).
 *
 * Two field spellings are in the wild, and neither is part of the OpenAI wire format:
 *
 * - `delta.reasoning_content` — DeepSeek, and the providers that copied it.
 * - `delta.reasoning` — some gateways (OpenRouter-style proxies, a few vLLM/SGLang setups).
 *
 * Reading only the first silently dropped the entire chain of thought behind those gateways:
 * the stream still succeeded, so nothing failed — the thinking just never appeared. This is the
 * same gap TanStack closed in `@tanstack/ai-openai` 0.22.9; it does not reach us, because we
 * build our own adapter on `@tanstack/openai-base` and override `extractReasoning`, so the fix
 * has to live here.
 *
 * `reasoning_content` is preferred when both carry text, being the more specific name; a field that
 * is empty does not block the other.
 */
export function extractReasoningContentFromStreamChunk(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== "object") return undefined;

  const choices = (chunk as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;

  const delta = (choices[0] as { delta?: { reasoning_content?: string | null; reasoning?: string | null } }).delta;
  // `??` is deliberately not used to pick between the two: a gateway sending `reasoning_content: ""`
  // (an empty first delta is common) would then win and mask a populated `reasoning`. Neither
  // field should stand in the way of the other unless it actually carries text.
  return firstNonEmptyText(delta?.reasoning_content, delta?.reasoning);
}

/** The first argument that is a non-empty string, else undefined. */
function firstNonEmptyText(...values: (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
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
