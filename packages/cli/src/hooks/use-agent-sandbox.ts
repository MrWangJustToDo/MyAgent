import { createState } from "reactivity-store";

import type { Sandbox } from "@my-agent/core";

export const useAgentSandbox = createState(() => ({ sandbox: null as Sandbox | null }), {
  withActions: (s) => ({
    setSandbox: (c: Sandbox | null) => {
      s.sandbox = c;
    },
  }),

  withNamespace: "useAgentSandbox",

  withDeepSelector: false,

  withStableSelector: true,
});
