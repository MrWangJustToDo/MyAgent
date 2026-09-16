import { createState } from "reactivity-store";

/**
 * Measured rendered heights for static transcript rows, keyed by message id.
 *
 * Rows are rendered inside `<StaticRender>`, so their height is only known *after* layout
 * (`onRender` → `measureElement`). The `MessageList` line budget spends this store to decide
 * how many trailing rows fit, which means the budget can only be exact for rows already
 * rendered at least once. Rows without an entry get a provisional allowance — see
 * `MessageList`.
 */
export const useStaticHeights = createState(
  () => ({
    /** message id -> measured height in terminal lines */
    heights: {} as Record<string, number>,
    /** Bumped when a measurement changes, so budget consumers re-derive. */
    version: 0,
  }),
  {
    withActions(s) {
      return {
        recordHeight: (id: string, height: number) => {
          if (!Number.isFinite(height) || height <= 0) return;
          const rounded = Math.round(height);
          if (s.heights[id] === rounded) return;
          // Replace the record rather than mutating in place: the store is read with a
          // reference selector, so an in-place write would not notify subscribers.
          s.heights = { ...s.heights, [id]: rounded };
          s.version++;
        },
        /**
         * Drop measurements for ids that left the row set. Without this the map grows for
         * the whole session while only the trailing window is ever consulted.
         */
        retainIds: (ids: string[]) => {
          const keep = new Set(ids);
          const stale = Object.keys(s.heights).filter((id) => !keep.has(id));
          if (!stale.length) return;
          const next = { ...s.heights };
          for (const id of stale) delete next[id];
          s.heights = next;
          s.version++;
        },
      };
    },

    withDeepSelector: false,

    withStableSelector: true,
  }
);
