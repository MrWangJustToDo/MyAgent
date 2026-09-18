import { createState } from "reactivity-store";

import type { AgentStatus } from "@codent/core";

export const useAgentStatus = createState(() => ({ status: "idle" as AgentStatus }), {
  withActions: (s) => ({
    setStatus: (status: AgentStatus) => (s.status = status),
  }),

  withNamespace: "useAgentStatus",

  withDeepSelector: false,

  withStableSelector: true,
});
