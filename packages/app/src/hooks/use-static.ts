import { useStdout } from "ink";
import { type JSX } from "react";
import { createState, markRaw } from "reactivity-store";

export const useStatic = createState(
  () => ({
    stdoutRef: markRaw({ current: null as ReturnType<typeof useStdout>["stdout"] | null }),
    header: null as JSX.Element | null,
    list: [] as JSX.Element[],
    headerSet: 0,
    listSet: 0,
  }),
  {
    withActions(s) {
      return {
        useInitStdout: () => {
          try {
            const { stdout } = useStdout();
            s.stdoutRef.current = stdout;
          } catch {
            // In web environments where useStdout may not be available
          }
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
