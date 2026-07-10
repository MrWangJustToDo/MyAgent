import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export type SubagentPanelView = "closed" | "list" | "detail";

// ============================================================================
// State
// ============================================================================

export const CLOSE_DEBOUNCE_MS = 300;

export const useSubagentPanel = createState(
  () => ({
    view: "closed" as SubagentPanelView,
    selectedSubagentId: null as string | null,
    lastClosedAt: 0,
  }),
  {
    withActions: (state) => ({
      openList: () => {
        state.view = "list";
        state.selectedSubagentId = null;
      },
      close: () => {
        state.view = "closed";
        state.selectedSubagentId = null;
        state.lastClosedAt = Date.now();
      },
      openDetail: (subagentId: string) => {
        state.view = "detail";
        state.selectedSubagentId = subagentId;
      },
      backToList: () => {
        state.view = "list";
        state.selectedSubagentId = null;
      },
    }),
    withNamespace: "useSubagentPanel",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
