import { createState } from "reactivity-store";

/**
 * Toggle for in-banner plan markdown preview (ready phase only).
 * Kept separate from chat input so `p` can open review without typing.
 */
export const usePlanPreview = createState(
  () => ({
    open: false,
  }),
  {
    withActions: (state) => ({
      toggle: () => {
        state.open = !state.open;
      },
      show: () => {
        state.open = true;
      },
      hide: () => {
        state.open = false;
      },
    }),
  }
);
