import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export type SubagentPanelView = "closed" | "list" | "detail";

// ============================================================================
// State
// ============================================================================

export const useSubagentPanel = createState(
  () => ({
    view: "closed" as SubagentPanelView,
    selectedSubagentId: null as string | null,
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
