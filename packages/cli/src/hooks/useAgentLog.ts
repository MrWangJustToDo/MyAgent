import { createState } from "reactivity-store";

import type { AgentLog } from "@my-agent/core";

export const useAgentLog = createState(() => ({ log: null as AgentLog | null }), {
  withActions: (s) => ({
    setLog: (c: AgentLog | null) => {
      s.log = c;
    },
  }),

  withNamespace: "useAgentLog",

  withDeepSelector: false,

  withStableSelector: true,
});
