import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export type InputMode = "normal" | "approval" | "select" | "freeform";

/** Why freeform mode was entered */
export type FreeformContext = "deny" | "ask_user";

// ============================================================================
// State Hook
// ============================================================================

export const useInputMode = createState(
  () => ({
    mode: "normal" as InputMode,
    denyMode: false,
    freeformContext: "deny" as FreeformContext,
  }),
  {
    withActions: (state) => ({
      setMode: (mode: InputMode) => {
        state.mode = mode;
      },
      setDenyMode: (deny: boolean, context?: FreeformContext) => {
        state.denyMode = deny;
        if (deny && context) {
          state.freeformContext = context;
        }
      },
    }),
    withNamespace: "useInputMode",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
