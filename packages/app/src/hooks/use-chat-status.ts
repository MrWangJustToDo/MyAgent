import { createState } from "reactivity-store";

import type { ChatStatus } from "ai";

export const useChatStatus = createState(
  () => ({ state: "ready" as ChatStatus, error: null as Error | null, pendingAskUserCount: 0 }),
  {
    withActions: (s) => ({
      setStatus: (status: ChatStatus) => {
        s.state = status;
      },
      setError: (error: Error | null) => {
        s.error = error;
      },
      setPendingAskUserCount: (count: number) => {
        s.pendingAskUserCount = count;
      },
    }),
    withNamespace: "useChatStatus",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
