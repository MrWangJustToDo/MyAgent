import { createState } from "reactivity-store";

import type { JSX } from "react";

export const useDynamic = createState(() => ({ list: [] as JSX.Element[], listSet: 0 }), {
  withActions: (s) => ({
    setDynamicList: (items: JSX.Element[]) => ((s.list = items), s.listSet++),
  }),

  withNamespace: "useDynamic",

  withDeepSelector: false,

  withStableSelector: true,
});
