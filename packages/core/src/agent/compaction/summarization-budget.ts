/**
 * Token budget helpers for compaction summarization subagents.
 */

import { estimateTokens } from "./token-estimator.js";

import type { AgentManager } from "../../managers/manager-agent.js";
import type { ModelMessage } from "@tanstack/ai";

/** Fallback context window when model metadata is unavailable. */
export const DEFAULT_SUMMARIZATION_CONTEXT_WINDOW = 128_000;

/** Fraction of context window reserved for serialized conversation input. */
export const SUMMARIZATION_INPUT_BUDGET_RATIO = 0.55;

/** Reserve tokens for system prompt, instructions, and model output. */
export const SUMMARIZATION_OVERHEAD_TOKENS = 8_000;

/** Minimum input budget so tiny models still get a usable slice. */
export const MIN_SUMMARIZATION_INPUT_BUDGET = 16_000;

/**
 * Resolve how many tokens of conversation can be sent to one summarization call.
 */
export function resolveSummarizationInputBudget(manager: AgentManager, parentAgentId: string): number {
  const parent = manager.getAgent(parentAgentId);
  const contextWindow = parent?.getModelInfo()?.contextWindow ?? DEFAULT_SUMMARIZATION_CONTEXT_WINDOW;
  const budget = Math.floor(contextWindow * SUMMARIZATION_INPUT_BUDGET_RATIO) - SUMMARIZATION_OVERHEAD_TOKENS;
  return Math.max(MIN_SUMMARIZATION_INPUT_BUDGET, budget);
}

/**
 * Split messages into batches that each fit within the summarization token budget.
 */
export function splitMessagesByTokenBudget(messages: ModelMessage[], maxTokens: number): ModelMessage[][] {
  if (messages.length === 0) return [];

  const batches: ModelMessage[][] = [];
  let current: ModelMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateTokens([message]);
    if (current.length > 0 && currentTokens + messageTokens > maxTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}
