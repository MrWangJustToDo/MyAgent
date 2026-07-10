import { createState } from "reactivity-store";

import type { ManagedAgent } from "@my-agent/core";

export const useAgent = createState(() => ({ agent: null as ManagedAgent | null }), {
  withActions: (s) => ({
    setAgent: (c: ManagedAgent | null) => {
      s.agent = c;
    },
  }),

  withNamespace: "useAgent",

  withDeepSelector: false,

  withStableSelector: true,
});
