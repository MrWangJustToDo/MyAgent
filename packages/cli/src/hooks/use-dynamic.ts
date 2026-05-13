import { createState } from "reactivity-store";

import type { JSX } from "react";

export const useDynamic = createState(() => ({ list: [] as JSX.Element[], listSet: 0, key: 0 }), {
  withActions: (s) => ({
    setDynamicList: (items: JSX.Element[]) => ((s.list = items), s.listSet++),
    setDynamicKey: (key: number) => (s.key = key),
  }),

  withNamespace: "useDynamic",

  withDeepSelector: false,

  withStableSelector: true,
});
