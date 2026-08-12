/**
 * Resolve an AgentSession for a root or child id via the active Host.
 */

import { useAgent } from "../hooks/use-agent.js";

import type { AgentSession } from "@my-agent/core";

export function getActiveSession(): AgentSession | null {
  return useAgent.getReadonlyState().session;
}

export function getActiveHost() {
  return useAgent.getReadonlyState().host;
}

/** Root session, or `host.connect(agentId)` for a child / other agent. */
export function resolveAgentSession(agentId: string | null | undefined): AgentSession | null {
  if (!agentId) return null;
  const { host, session } = useAgent.getReadonlyState();
  if (session?.id === agentId) return session;
  return host?.connect(agentId) ?? null;
}
