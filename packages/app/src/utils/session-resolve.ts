/**
 * Resolve an AgentSession for a root or child id via the active Host.
 *
 * reactivity-store selectors / getReadonlyState() wrap stored objects as
 * readonly proxies. Session/Host are live handles (`subscribe`, `dispatch`,
 * `connect`) — always unwrap with {@link toRaw} before calling methods.
 */

import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";

import type { AgentSession, AgentSessionHost } from "@my-agent/core";

function unwrapHandle<T extends object>(value: T | null | undefined): T | null {
  if (value == null) return null;
  return toRaw(value);
}

export function getActiveSession(): AgentSession | null {
  return unwrapHandle(useAgent.getReadonlyState().session);
}

/**
 * Look up a live session by id from the app store registry.
 * Falls back to `host.connect(agentId)` for sessions not yet registered
 * (e.g. subagents), mirroring {@link resolveAgentSession}.
 */
export function getSessionById(agentId: string): AgentSession | null {
  const state = useAgent.getReadonlyState();
  const registered = state.sessions?.[agentId];
  if (registered) return unwrapHandle(registered);
  const host = unwrapHandle(state.host);
  return unwrapHandle(host?.connect(agentId));
}

export function getActiveHost(): AgentSessionHost | null {
  return unwrapHandle(useAgent.getReadonlyState().host);
}

/** Root session, or `host.connect(agentId)` for a child / other agent. */
export function resolveAgentSession(agentId: string | null | undefined): AgentSession | null {
  if (!agentId) return null;
  const session = getActiveSession();
  const host = getActiveHost();
  if (session?.id === agentId) return session;
  return unwrapHandle(host?.connect(agentId));
}

/**
 * Cycle the active session forward through the live registry (wraps around).
 * No-op when fewer than two sessions are registered.
 */
export function cycleActiveSession(): AgentSession | null {
  const state = useAgent.getReadonlyState();
  const ids = Object.keys(state.sessions ?? {});
  if (ids.length < 2) return null;
  const current = state.activeSessionId;
  const idx = current ? ids.indexOf(current) : -1;
  const next = ids[(idx + 1) % ids.length];
  useAgent.getActions().activateSession(next);
  return unwrapHandle(state.sessions[next]);
}
