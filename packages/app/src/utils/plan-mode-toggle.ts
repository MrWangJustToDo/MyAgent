import type { AgentMode, ManagedAgent } from "@my-agent/core";

/**
 * Cycle agent mode: normal → auto → plan → normal → …
 * The StatusBar already shows the current mode via formatStatusBarModeLabel(),
 * so no feedback notification is needed.
 */
export function cycleAgentMode(agent: ManagedAgent | null | undefined): void {
  if (!agent) return;
  const mode: AgentMode = agent.getAgentMode();

  if (mode === "normal") {
    // normal → auto
    agent.setAutoModeEnabled(true);
  } else if (mode === "auto") {
    // auto → plan
    agent.enablePlanMode();
  } else {
    // plan → normal
    agent.disablePlanMode();
  }
}
