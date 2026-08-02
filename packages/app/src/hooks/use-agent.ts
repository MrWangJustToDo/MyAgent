import { createState } from "reactivity-store";

import type { AgentSession, ManagedAgent } from "@my-agent/core";

/**
 * Host store for the active agent.
 * Prefer {@link session} for UI data and commands; {@link agent} remains for
 * slash-command escape hatches not yet mapped to AgentSession.dispatch.
 */
export const useAgent = createState(
  () => ({
    agent: null as ManagedAgent | null,
    session: null as AgentSession | null,
  }),
  {
    withActions: (s) => ({
      setAgent: (c: ManagedAgent | null) => {
        s.agent = c;
      },
      setSession: (session: AgentSession | null) => {
        s.session = session;
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,
  }
);
