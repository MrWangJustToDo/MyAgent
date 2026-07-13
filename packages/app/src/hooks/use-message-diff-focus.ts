import { createState } from "reactivity-store";

import type { DiffViewRef } from "@git-diff-view/cli";

// ============================================================================
// Types
// ============================================================================

export type MessageDiffEntry = {
  toolCallId: string;
  approvalId?: string;
};

const scrollRefs = new Map<string, DiffViewRef | null>();

// ============================================================================
// State
// ============================================================================

export const useMessageDiffFocus = createState(
  () => ({
    entries: [] as MessageDiffEntry[],
    selectedIndex: 0,
  }),
  {
    withActions: (state) => ({
      register: (entry: MessageDiffEntry) => {
        const index = state.entries.findIndex((item) => item.toolCallId === entry.toolCallId);
        if (index >= 0) {
          state.entries[index] = entry;
          return;
        }
        state.entries.push(entry);
        if (state.entries.length === 1) state.selectedIndex = 0;
      },
      unregister: (toolCallId: string) => {
        const index = state.entries.findIndex((item) => item.toolCallId === toolCallId);
        if (index < 0) return;
        state.entries.splice(index, 1);
        scrollRefs.delete(toolCallId);
        if (state.entries.length === 0) {
          state.selectedIndex = 0;
          return;
        }
        if (state.selectedIndex >= state.entries.length) {
          state.selectedIndex = state.entries.length - 1;
        } else if (index < state.selectedIndex) {
          state.selectedIndex -= 1;
        }
      },
      setScrollRef: (toolCallId: string, ref: DiffViewRef | null) => {
        scrollRefs.set(toolCallId, ref);
      },
      getScrollRef: (toolCallId: string) => scrollRefs.get(toolCallId) ?? null,
      selectNext: () => {
        if (state.entries.length <= 1) return;
        state.selectedIndex = (state.selectedIndex + 1) % state.entries.length;
      },
      getSelectedEntry: (): MessageDiffEntry | undefined => state.entries[state.selectedIndex],
      getSelectedScrollRef: (): DiffViewRef | null => {
        const entry = state.entries[state.selectedIndex];
        if (!entry) return null;
        return scrollRefs.get(entry.toolCallId) ?? null;
      },
      clear: () => {
        state.entries = [];
        state.selectedIndex = 0;
        scrollRefs.clear();
      },
    }),
    withNamespace: "useMessageDiffFocus",
    withDeepSelector: false,
    withStableSelector: true,
  }
);

/** Resolve pending approval for the currently focused dynamic diff, if any. */
export function resolveFocusedPendingApproval<T extends { id: string; toolName: string; toolCallId: string }>(
  allPending: T[],
  entries: readonly MessageDiffEntry[],
  selectedIndex: number
): T | undefined {
  if (entries.length === 0) return allPending[0];
  const entry = entries[selectedIndex];
  if (!entry?.approvalId) return undefined;
  return allPending.find((item) => item.id === entry.approvalId);
}
