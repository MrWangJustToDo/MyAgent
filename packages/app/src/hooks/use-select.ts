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
  /** Draft text the user typed for the free-form option (preserved across edits). */
  freeformDraft: string;
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
  freeformDraft: "",
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
      state.freeformDraft = "";
    },

    close: () => {
      state.visible = false;
      state.options = [];
      state.selectedIndex = 0;
      state.selectedSet = [];
      state.multiSelect = false;
      state.freeformEnabled = false;
      state.freeformDraft = "";
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
      // Allow toggling the freeform option only when it has a draft value
      if (state.freeformEnabled && idx === state.options.length - 1) {
        if (!state.freeformDraft) return;
      }
      const pos = state.selectedSet.indexOf(idx);
      if (pos === -1) {
        state.selectedSet = [...state.selectedSet, idx];
      } else {
        state.selectedSet = state.selectedSet.filter((i) => i !== idx);
      }
    },

    /** Store / clear the free-form draft text (preserved across edits). */
    setFreeformDraft: (text: string) => {
      state.freeformDraft = text;
      // In multi-select, if draft becomes empty, drop the freeform option from the
      // selected set so it doesn't contribute an empty value on submit.
      if (!text && state.freeformEnabled && state.multiSelect) {
        const freeformIdx = state.options.length - 1;
        state.selectedSet = state.selectedSet.filter((i) => i !== freeformIdx);
      }
    },

    getFreeformDraft: (): string => state.freeformDraft,

    /** Check if cursor is on the freeform "Your answer" option */
    isFreeformSelected: (): boolean => {
      return state.freeformEnabled && state.selectedIndex === state.options.length - 1;
    },

    /** Get the result as a string (single or multi-select) */
    getResult: (): string => {
      if (state.multiSelect) {
        // If the user typed a free-form draft, always include it (regardless of
        // whether they toggled the row — having typed it implies intent).
        const draft = state.freeformEnabled ? state.freeformDraft : "";
        const indices = state.selectedSet.length > 0 ? state.selectedSet : [state.selectedIndex];
        const labels = indices
          .sort((a, b) => a - b)
          .filter((i) => !(state.freeformEnabled && i === state.options.length - 1))
          .map((i) => state.options[i]?.label ?? "")
          .filter(Boolean);
        if (draft) labels.push(draft);
        return labels.join(", ");
      }
      // Single-select: if the cursor is on the freeform option, use the draft.
      if (state.freeformEnabled && state.selectedIndex === state.options.length - 1) {
        return state.freeformDraft;
      }
      return state.options[state.selectedIndex]?.value ?? "";
    },
  }),

  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useSelect",
});
