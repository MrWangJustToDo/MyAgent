import { createState } from "reactivity-store";

import type { TodoItem } from "@my-agent/core";

export interface TodoStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

function computeStats(items: TodoItem[]): TodoStats {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  for (const item of items) {
    if (item.status === "completed") completed += 1;
    else if (item.status === "in_progress") inProgress += 1;
    else pending += 1;
  }
  return { total: items.length, completed, inProgress, pending };
}

const emptyStats = (): TodoStats => ({ total: 0, completed: 0, inProgress: 0, pending: 0 });

/**
 * Session-projected todos (no live TodoManager). Seeded from snapshot / `todos` channel.
 */
export const useTodoManager = createState(
  () => ({
    items: [] as TodoItem[],
    title: null as string | null,
    stats: emptyStats(),
  }),
  {
    withActions: (s) => ({
      setFromSession: (items: TodoItem[], title: string | null = null) => {
        s.items = items;
        s.title = title;
        s.stats = computeStats(items);
      },
      clear: () => {
        s.items = [];
        s.title = null;
        s.stats = emptyStats();
      },
      /** @deprecated Use {@link setFromSession}; kept for clearAdapterHooks compatibility. */
      setManager: (_m: unknown) => {
        s.items = [];
        s.title = null;
        s.stats = emptyStats();
      },
      refresh: () => {
        // no-op: items are pushed from the session `todos` channel
      },
    }),

    withNamespace: "useTodoManager",

    withDeepSelector: false,

    withStableSelector: true,
  }
);
