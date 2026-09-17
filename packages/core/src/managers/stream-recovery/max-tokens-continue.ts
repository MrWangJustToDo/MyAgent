import type { AgentRunner } from "../../agent/runner/agent-runner.js";
import type { ManagedAgent } from "../managed-agent.js";

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
  /** True when the run should be retried (escalation or continuation armed). */
  shouldRetry: boolean;
}

/**
 * Handle finishReason === "length": escalate max_tokens once, then inject continuation prompts.
 */
export function handleMaxTokensTruncation(options: {
  managed: ManagedAgent;
  runner?: AgentRunner;
  truncation: TruncationState;
}): TruncationRecoveryResult {
  const { managed, runner, truncation } = options;

  if (!truncation.maxTokensEscalated && runner) {
    runner.setMaxOutputTokens(ESCALATED_MAX_TOKENS);
    truncation.maxTokensEscalated = true;
    managed.log?.debug("agent", "Output truncated — escalating max_tokens", {
      escalatedTokens: ESCALATED_MAX_TOKENS,
    });
    return { shouldRetry: true };
  }

  if (truncation.continuationCount < MAX_TRUNCATION_CONTINUATIONS) {
    truncation.continuationCount++;
    managed.log?.debug("agent", "Output truncated — injecting continuation prompt", {
      continuationCount: truncation.continuationCount,
    });
    // NOTE: wire-only recovery, and the reason this is a flag on the run rather than an
    // extra message appended to the array handed to the engine: `compaction` rebuilds
    // every wire call from `channel.getMessages()` and discards the incoming
    // `config.messages`. Appending here reaches the first call only, then the next
    // projection overwrites it — the prompt never reached the model. The flag is
    // applied by the `wire-recovery` middleware, which runs after that projection.
    //
    // The prompt is still not durable: it is NOT written to the UI channel and NOT
    // persisted to session, so the channel stays cache-stable and the transcript keeps
    // only what the user actually said.
    managed.run.setWireContinuationArmed(true);
    return { shouldRetry: true };
  }

  managed.log?.warn("agent", "Output truncated — max continuations reached, returning partial result");
  return { shouldRetry: false };
}
