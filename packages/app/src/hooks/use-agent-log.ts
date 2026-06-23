import { createState } from "reactivity-store";

import { useNotification } from "./use-notification.js";

import type { AgentLog } from "@my-agent/core";

export const useAgentLog = createState(
  () => ({ log: null as AgentLog | null, unsubscribe: null as (() => void) | null | undefined }),
  {
    withActions: (s) => ({
      setLog: (c: AgentLog | null) => {
        s.unsubscribe?.();
        s.log = c;
        s.unsubscribe = s.log?.onNotification((notify) => useNotification.getActions().setNotification(notify));
      },
    }),

    withNamespace: "useAgentLog",

    withDeepSelector: false,

    withStableSelector: true,
  }
);
