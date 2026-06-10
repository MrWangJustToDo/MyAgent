import { createState } from "reactivity-store";

import type { AgentNotification } from "@my-agent/core";

export const useNotification = createState(() => ({ state: [] as AgentNotification[] }), {
  withActions: (s) => ({
    setNotification: (item: AgentNotification) => {
      s.state.push(item);
    },
    consume: () => s.state.shift(),
    clear: () => (s.state.length = 0),
  }),
});
