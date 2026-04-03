import { useStdout } from "ink";
import { type JSX } from "react";
import { createState, markRaw } from "reactivity-store";

import type { WriteStream } from "tty";

export const useStatic = createState(
  () => ({
    stdoutRef: markRaw({ current: null as WriteStream | null }),
    header: null as JSX.Element | null,
    list: [] as JSX.Element[],
    headerSet: 0,
    listSet: 0,
  }),
  {
    withActions(s) {
      return {
        useInitStdout: () => {
          const { stdout } = useStdout();

          s.stdoutRef.current = stdout;
        },
        setStaticHeader: (item: JSX.Element) => ((s.header = item), s.headerSet++),
        setStaticList: (items: JSX.Element[]) => ((s.list = items), s.listSet++),
      };
    },

    withNamespace: "useStatic",

    withDeepSelector: false,

    withStableSelector: true,
  }
);
