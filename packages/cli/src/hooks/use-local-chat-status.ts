import { createState } from "reactivity-store";

import type { ChatStatus } from "ai";

export const useLocalChatStatus = createState(
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
    withNamespace: "useLocalChatStatus",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
