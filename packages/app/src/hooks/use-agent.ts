import { createState, markRaw } from "reactivity-store";

import type { AgentSession, AgentSessionHost } from "@my-agent/core";

/**
 * Active Session + Host for the UI. No ManagedAgent.
 *
 * Session/Host are live handles (`subscribe` / `dispatch`). Store them with
 * {@link markRaw} so selectors do not wrap them as readonly proxies.
 */
export const useAgent = createState(
  () => ({
    host: null as AgentSessionHost | null,
    session: null as AgentSession | null,
  }),
  {
    withActions: (s) => ({
      setHost: (host: AgentSessionHost | null) => {
        s.host = host ? markRaw(host) : null;
      },
      setSession: (session: AgentSession | null) => {
        s.session = session ? markRaw(session) : null;
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,
  }
);
