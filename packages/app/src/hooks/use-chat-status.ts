import { createState } from "reactivity-store";

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export const useChatStatus = createState(
  () => ({
    state: "ready" as ChatStatus,
    error: null as Error | null,
    pendingAskUserCount: 0,
    pendingApprovalCount: 0,
  }),
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
      setPendingApprovalCount: (count: number) => {
        s.pendingApprovalCount = count;
      },
    }),
    withNamespace: "useChatStatus",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
