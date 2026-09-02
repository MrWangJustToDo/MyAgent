import type { AgentRunner } from "../../agent/runner/agent-runner.js";
import type { ManagedAgent } from "../managed-agent.js";
import type { ModelMessage, UIMessage } from "@tanstack/ai";

/** Max number of truncation continuation retries after max_tokens escalation. */
export const MAX_TRUNCATION_CONTINUATIONS = 3;
/** Escalated max output tokens for the first truncation retry. */
export const ESCALATED_MAX_TOKENS = 64000;

/**
 * Continuation prompt injected when the model hits max_tokens.
 * Tells the model to resume directly without apology or recap.
 */
export const CONTINUATION_PROMPT =
  "Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.";

export interface TruncationState {
  maxTokensEscalated: boolean;
  continuationCount: number;
}

export function createTruncationState(): TruncationState {
  return {
    maxTokensEscalated: false,
    continuationCount: 0,
  };
}

export interface TruncationRecoveryResult {
  /** Messages to retry with, or null when max continuations reached. */
  messages: Array<UIMessage | ModelMessage> | null;
  shouldRetry: boolean;
}

/**
 * Handle finishReason === "length": escalate max_tokens once, then inject continuation prompts.
 */
export function handleMaxTokensTruncation(options: {
  managed: ManagedAgent;
  runner?: AgentRunner;
  messages: Array<UIMessage | ModelMessage>;
  truncation: TruncationState;
}): TruncationRecoveryResult {
  const { managed, runner, messages, truncation } = options;

  if (!truncation.maxTokensEscalated && runner) {
    runner.setMaxOutputTokens(ESCALATED_MAX_TOKENS);
    truncation.maxTokensEscalated = true;
    managed.log?.debug("agent", "Output truncated — escalating max_tokens", {
      escalatedTokens: ESCALATED_MAX_TOKENS,
    });
    return { messages, shouldRetry: true };
  }

  if (truncation.continuationCount < MAX_TRUNCATION_CONTINUATIONS) {
    const contextMessages = managed.getMessagesForLLM() ?? (messages as Array<UIMessage | ModelMessage>);
    truncation.continuationCount++;
    managed.log?.debug("agent", "Output truncated — injecting continuation prompt", {
      continuationCount: truncation.continuationCount,
    });
    // NOTE: wire-only recovery. The continuation prompt is a single-turn retry
    // mechanism, not a durable part of the conversation, so it is NOT written to
    // the UI channel, NOT persisted to session, and intentionally bypasses the
    // turn-context/`appendChannelMessages` path. It is rebuilt on every retry from
    // `getMessagesForLLM()` (the pre-truncation context), which stays cache-stable.
    return {
      messages: [...contextMessages, { role: "user" as const, content: CONTINUATION_PROMPT }],
      shouldRetry: true,
    };
  }

  managed.log?.warn("agent", "Output truncated — max continuations reached, returning partial result");
  return { messages: null, shouldRetry: false };
}
