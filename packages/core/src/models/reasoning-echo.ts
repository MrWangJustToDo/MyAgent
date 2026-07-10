import type { ModelMessage } from "@tanstack/ai";

/** Join TanStack assistant `thinking` blocks into DeepSeek `reasoning_content`. */
export function buildReasoningContentFromThinking(thinking: ModelMessage["thinking"] | undefined): string | undefined {
  if (!thinking?.length) return undefined;
  const content = thinking.map((entry) => entry.content).join("");
  return content.length > 0 ? content : undefined;
}

/** Read `reasoning_content` from a Chat Completions stream chunk (DeepSeek thinking mode). */
export function extractReasoningContentFromStreamChunk(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== "object") return undefined;

  const choices = (chunk as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;

  const delta = (choices[0] as { delta?: { reasoning_content?: string | null } }).delta;
  const reasoning = delta?.reasoning_content;
  return typeof reasoning === "string" && reasoning.length > 0 ? reasoning : undefined;
}

/** Whether this endpoint/model likely requires `reasoning_content` echo-back. */
export function shouldEchoReasoningContent(baseURL: string, model: string): boolean {
  const haystack = `${baseURL} ${model}`.toLowerCase();
  return haystack.includes("deepseek");
}
