import { createState } from "reactivity-store";

import { getAllCommands } from "../commands";

import type { Command } from "../commands";

// ============================================================================
// Types
// ============================================================================

export interface AutocompleteState {
  /** Filtered command suggestions */
  suggestions: readonly Command[];
  /** Currently selected index */
  selectedIndex: number;
  /** Whether the suggestion list is visible */
  visible: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AutocompleteState = {
  suggestions: [],
  selectedIndex: 0,
  visible: false,
};

// ============================================================================
// State Hook
// ============================================================================

export const useAutocomplete = createState(() => ({ ...initialState }), {
  withActions: (state) => ({
    /**
     * Update suggestions based on current input.
     * Shows suggestions when input starts with "/" and has matching commands.
     */
    update: (input: string) => {
      if (!input.startsWith("/")) {
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        return;
      }

      // Extract the command name portion (before first space)
      const spaceIndex = input.indexOf(" ");
      if (spaceIndex !== -1) {
        // User already typed args — hide suggestions
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        return;
      }

      const prefix = input.slice(1).toLowerCase();
      const commands = getAllCommands();
      const filtered = prefix ? commands.filter((c) => c.name.startsWith(prefix)) : [...commands];

      state.suggestions = filtered;
      state.selectedIndex = filtered.length > 0 ? Math.min(state.selectedIndex, filtered.length - 1) : 0;
      state.visible = filtered.length > 0;
    },

    /**
     * Select next suggestion
     */
    selectNext: () => {
      if (!state.visible || state.suggestions.length === 0) return;
      state.selectedIndex = (state.selectedIndex + 1) % state.suggestions.length;
    },

    /**
     * Select previous suggestion
     */
    selectPrev: () => {
      if (!state.visible || state.suggestions.length === 0) return;
      state.selectedIndex = (state.selectedIndex - 1 + state.suggestions.length) % state.suggestions.length;
    },

    /**
     * Accept the currently selected suggestion.
     * Returns the full command string (e.g. "/attach ") or null if nothing to accept.
     */
    accept: (): string | null => {
      if (!state.visible || state.suggestions.length === 0) return null;
      const selected = state.suggestions[state.selectedIndex];
      if (!selected) return null;

      state.suggestions = [];
      state.selectedIndex = 0;
      state.visible = false;

      return `/${selected.name} `;
    },

    /**
     * Dismiss suggestions
     */
    dismiss: () => {
      state.suggestions = [];
      state.selectedIndex = 0;
      state.visible = false;
    },
  }),

  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useAutocomplete",
});
