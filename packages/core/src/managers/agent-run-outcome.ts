/**
 * Typed end-of-run / mid-run status policies for {@link AgentStatusController}.
 */

import type { UIMessage } from "@tanstack/ai";

/** How a run ended (or paused) for status finalization. */
export type AgentRunOutcomeKind = "finished" | "aborted" | "error" | "waiting";

/**
 * Chat vs detached completion differ for leftover wait states:
 * - `chat` — preserve waiting / awaiting_user (approval / ask_user)
 * - `detached` — force terminal completed so task panel does not keep ghosts
 */
export type AgentRunPath = "chat" | "detached";

export interface AgentRunOutcome {
  kind: AgentRunOutcomeKind;
  messages: UIMessage[];
  path?: AgentRunPath;
  finishReason?: string | null;
  errorMessage?: string;
}

/** Named mid-run / load-time reconcile policies (replaces raw whenClear literals at call sites). */
export type StatusReconcilePolicy = "during-run" | "after-chat-run" | "idle-clear";

export type WhenClearStatus = "idle" | "running" | "completed";

export function whenClearForReconcilePolicy(policy: StatusReconcilePolicy): WhenClearStatus {
  switch (policy) {
    case "during-run":
      return "running";
    case "after-chat-run":
      return "completed";
    case "idle-clear":
      return "idle";
  }
}
