import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectState {
  visible: boolean;
  options: SelectOption[];
  selectedIndex: number;
  /** Toggled indices for multi-select */
  selectedSet: number[];
  multiSelect: boolean;
  /** Whether the last option is a free-form "Your answer" entry */
  freeformEnabled: boolean;
}

// ============================================================================
// State Hook
// ============================================================================

const initialState: SelectState = {
  visible: false,
  options: [],
  selectedIndex: 0,
  selectedSet: [],
  multiSelect: false,
  freeformEnabled: false,
};

export const useSelect = createState(() => ({ ...initialState }), {
  withActions: (state) => ({
    open: (options: SelectOption[], multiSelect: boolean, freeformEnabled: boolean) => {
      state.visible = true;
      state.options = options;
      state.selectedIndex = 0;
      state.selectedSet = [];
      state.multiSelect = multiSelect;
      state.freeformEnabled = freeformEnabled;
    },

    close: () => {
      state.visible = false;
      state.options = [];
      state.selectedIndex = 0;
      state.selectedSet = [];
      state.multiSelect = false;
      state.freeformEnabled = false;
    },

    selectNext: () => {
      if (state.options.length === 0) return;
      state.selectedIndex = (state.selectedIndex + 1) % state.options.length;
    },

    selectPrev: () => {
      if (state.options.length === 0) return;
      state.selectedIndex = (state.selectedIndex - 1 + state.options.length) % state.options.length;
    },

    /** Toggle current item in multi-select mode */
    toggle: () => {
      if (!state.multiSelect) return;
      const idx = state.selectedIndex;
      // Don't toggle the freeform option
      if (state.freeformEnabled && idx === state.options.length - 1) return;
      const pos = state.selectedSet.indexOf(idx);
      if (pos === -1) {
        state.selectedSet = [...state.selectedSet, idx];
      } else {
        state.selectedSet = state.selectedSet.filter((i) => i !== idx);
      }
    },

    /** Check if cursor is on the freeform "Your answer" option */
    isFreeformSelected: (): boolean => {
      return state.freeformEnabled && state.selectedIndex === state.options.length - 1;
    },

    /** Get the result as a string (single or multi-select) */
    getResult: (): string => {
      if (state.multiSelect) {
        const indices = state.selectedSet.length > 0 ? state.selectedSet : [state.selectedIndex];
        return indices
          .sort((a, b) => a - b)
          .map((i) => state.options[i]?.label ?? "")
          .filter(Boolean)
          .join(", ");
      }
      return state.options[state.selectedIndex]?.value ?? "";
    },
  }),

  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useSelect",
});
