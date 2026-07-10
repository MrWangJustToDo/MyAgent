import { createState } from "reactivity-store";

import type { UIMessage } from "@tanstack/ai";

export type CachedFlatMessage = {
  signature: string;
  flat: UIMessage[];
};

export const useMessageCache = createState(() => ({ state: {} as Record<string, CachedFlatMessage> }), {
  withActions: (s) => ({
    setMessage: (key: string, value: CachedFlatMessage) => {
      s.state[key] = value;
    },
    getMessage: (key: string) => s.state[key],
    clear: () => (s.state = {}),
  }),
});
