import { createState } from "reactivity-store";

import type { AgentStatus } from "@my-agent/core";

export const useAgentStatus = createState(() => ({ status: "idle" as AgentStatus }), {
  withActions: (s) => ({
    setStatus: (status: AgentStatus) => (s.status = status),
  }),

  withNamespace: "useAgentStatus",

  withDeepSelector: false,

  withStableSelector: true,
});
