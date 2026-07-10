import { chat } from "@tanstack/ai";

import { extractTanStackUsage } from "../managers/usage-tracker.js";

import type { TextAdapterConfig } from "./adapter-factory.js";
import type { TokenUsage } from "../managers/usage-tracker-utils.js";

// ============================================================================
// Types
// ============================================================================

export interface SideTextQueryOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}

export interface SideTextQueryResult {
  text: string;
  usage?: TokenUsage;
}

// ============================================================================
// Side text query
// ============================================================================

/**
 * One-shot text generation via TanStack `chat()`.
 * Used for memory selection, session titles, and other lightweight LLM calls.
 */
export async function runSideTextQuery(
  textAdapter: TextAdapterConfig,
  options: SideTextQueryOptions
): Promise<SideTextQueryResult> {
  const abortController = new AbortController();
  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      abortController.abort(options.abortSignal.reason);
    } else {
      options.abortSignal.addEventListener("abort", () => abortController.abort(options.abortSignal!.reason), {
        once: true,
      });
    }
  }

  const stream = chat({
    adapter: textAdapter.adapter,
    messages: [{ role: "user", content: options.userPrompt }],
    systemPrompts: options.systemPrompt ? [options.systemPrompt] : undefined,
    abortController,
    modelOptions: options.maxOutputTokens != null ? { maxTokens: options.maxOutputTokens } : undefined,
  });

  let text = "";
  let usage: TokenUsage | undefined;

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      text += chunk.delta;
    }
    if (chunk.type === "RUN_FINISHED" && chunk.usage) {
      usage = extractTanStackUsage(chunk.usage);
    }
    if (chunk.type === "RUN_ERROR") {
      const message =
        chunk.error instanceof Error ? chunk.error.message : String(chunk.error ?? "Side text query failed");
      throw new Error(message);
    }
  }

  return { text: text.trim(), usage };
}
