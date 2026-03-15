import ansiEscapes from "ansi-escapes";
import { useStdout } from "ink";
import { createState, markRaw } from "reactivity-store";

import type { JSX } from "react";
import type { WriteStream } from "tty";

export const useStatic = createState(
  () => ({
    stdoutRef: markRaw({ current: null as WriteStream | null }),
    header: null as JSX.Element | null,
    state: [] as JSX.Element[],
    remountKey: 0,
  }),
  {
    withActions(s) {
      return {
        useInitStdout: () => {
          const { stdout } = useStdout();

          s.stdoutRef.current = stdout;
        },
        setStaticHeader: (item: JSX.Element) => (s.header = item),
        setStaticItem: (items: JSX.Element[]) => (s.state = items),
        refreshRemount: () => {
          s.stdoutRef.current?.write(ansiEscapes.clearTerminal);
          s.remountKey++;
        },
      };
    },

    withDeepSelector: false,

    withStableSelector: true,
  }
);
