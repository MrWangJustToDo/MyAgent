/**
 * Cycle agent mode via Session dispatch: normal → auto → plan → normal.
 */

import type { AgentSession } from "@my-agent/core";

export function cycleAgentMode(session: AgentSession | null | undefined): void {
  if (!session) return;
  const mode = session.getSnapshot().mode;

  if (mode === "normal") {
    void session.dispatch({ type: "auto.set", enabled: true });
  } else if (mode === "auto") {
    void session.dispatch({ type: "plan.enable" });
  } else {
    void session.dispatch({ type: "plan.disable" });
  }
}
