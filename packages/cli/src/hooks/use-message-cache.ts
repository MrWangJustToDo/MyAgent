import { createState } from "reactivity-store";

import type { UIMessage } from "ai";

export const useMessageCache = createState(() => ({ state: {} as Record<string, UIMessage[]> }), {
  withActions: (s) => ({
    setMessage: (key: string, value: UIMessage[]) => {
      s.state[key] = value;
    },
    getMessage: (key: string) => s.state[key],
    clear: () => (s.state = {}),
  }),
});
