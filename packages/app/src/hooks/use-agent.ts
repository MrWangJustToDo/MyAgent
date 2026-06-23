import { createState } from "reactivity-store";

import type { Agent } from "@my-agent/core";

export const useAgent = createState(() => ({ agent: null as Agent | null }), {
  withActions: (s) => ({
    setAgent: (c: Agent | null) => {
      s.agent = c;
    },
  }),

  withNamespace: "useAgent",

  withDeepSelector: false,

  withStableSelector: true,
});
