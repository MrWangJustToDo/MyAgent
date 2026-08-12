import { createState } from "reactivity-store";

import type { AgentSession, AgentSessionHost } from "@my-agent/core";

/**
 * Active Session + Host for the UI. No ManagedAgent.
 */
export const useAgent = createState(
  () => ({
    host: null as AgentSessionHost | null,
    session: null as AgentSession | null,
  }),
  {
    withActions: (s) => ({
      setHost: (host: AgentSessionHost | null) => {
        s.host = host;
      },
      setSession: (session: AgentSession | null) => {
        s.session = session;
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,
  }
);
