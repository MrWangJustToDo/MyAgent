import type { AgentRetryState } from "@my-agent/core";

/** Human label per retry strategy (shared by footer / task UI / panels). */
export const RETRY_STRATEGY_LABEL: Record<AgentRetryState["strategy"], string> = {
  transient: "provider busy",
  capability: "content stripped",
  reactive_compact: "context compacted",
  max_tokens: "output limit",
};

/** Single-line retry status, e.g. `Retrying (2/3) ~4s · provider busy`. */
export function formatRetryStatus(retry: AgentRetryState): string {
  const waitSeconds = retry.delayMs != null ? Math.max(1, Math.round(retry.delayMs / 1000)) : undefined;
  const wait = waitSeconds != null ? ` ~${waitSeconds}s` : "";
  return `Retrying (${retry.attempt}/${retry.maxAttempts})${wait} · ${RETRY_STRATEGY_LABEL[retry.strategy]}`;
}
