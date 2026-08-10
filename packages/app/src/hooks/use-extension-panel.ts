import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export type ExtensionPanelView = "closed" | "open";

// ============================================================================
// State
// ============================================================================

export const CLOSE_DEBOUNCE_MS = 300;

export const useExtensionPanel = createState(
  () => ({
    view: "closed" as ExtensionPanelView,
    revision: 0,
    lastClosedAt: 0,
  }),
  {
    withActions: (state) => ({
      open: () => {
        state.view = "open";
        state.revision += 1;
      },
      close: () => {
        state.view = "closed";
        state.lastClosedAt = Date.now();
      },
      toggle: () => {
        if (state.view === "open") {
          state.lastClosedAt = Date.now();
          state.view = "closed";
        } else {
          state.view = "open";
          state.revision += 1;
        }
      },
      /** Bump the revision to re-read extension state after a toggle. */
      refresh: () => {
        state.revision += 1;
      },
    }),
    withNamespace: "useExtensionPanel",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
