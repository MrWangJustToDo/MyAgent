import { createState } from "reactivity-store";

import type { TodoItem, TodoManager } from "@my-agent/core";

export interface TodoStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

export const useTodoManager = createState(
  () => ({
    manager: null as TodoManager | null,
    items: [] as TodoItem[],
    stats: { total: 0, completed: 0, inProgress: 0, pending: 0 } as TodoStats,
  }),
  {
    withActions: (s) => ({
      setManager: (m: TodoManager | null) => {
        s.manager = m;
        if (m) {
          s.items = m.getItems();
          s.stats = m.getStats();
        } else {
          s.items = [];
          s.stats = { total: 0, completed: 0, inProgress: 0, pending: 0 };
        }
      },
      refresh: () => {
        if (s.manager) {
          s.items = s.manager.getItems();
          s.stats = s.manager.getStats();
        }
      },
    }),

    withNamespace: "useTodoManager",

    withDeepSelector: false,

    withStableSelector: true,
  }
);
