import { createState } from "reactivity-store";

import type { AgentContext } from "@my-agent/core";

export const useAgentContext = createState(() => ({ context: null as AgentContext | null }), {
  withActions: (s) => ({
    setContext: (c: AgentContext | null) => {
      s.context = c;
    },
  }),

  withNamespace: "useAgentContext",

  withDeepSelector: false,

  withStableSelector: true,
});
