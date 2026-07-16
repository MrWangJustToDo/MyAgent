import { createState } from "reactivity-store";

import type { AgentContext } from "@my-agent/core";

export const useAgentContext = createState(() => ({ context: null as AgentContext | null, version: 0 }), {
  withActions: (s) => ({
    setContext: (c: AgentContext | null) => {
      s.context = c;
    },
    /** Force subscribers to re-evaluate after context internal mutations (e.g. reset). */
    bump: () => {
      s.version++;
    },
  }),

  // withNamespace: "useAgentContext",

  withDeepSelector: false,

  withStableSelector: true,
});
