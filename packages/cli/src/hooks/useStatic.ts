import ansiEscapes from "ansi-escapes";
import { useStdout } from "ink";
import { debounce } from "lodash-es";
import { useEffect, type JSX } from "react";
import { createState, markRaw, toRaw } from "reactivity-store";

import type { WriteStream } from "tty";

export const useStatic = createState(
  () => ({
    stdoutRef: markRaw({ current: null as WriteStream | null }),
    header: null as JSX.Element | null,
    state: [] as JSX.Element[],
    headerSet: 0,
    stateSet: 0,
    remountKey: 0,
  }),
  {
    withActions(s) {
      const refresh = debounce(() => {
        const stdout = toRaw(s.stdoutRef.current);
        stdout?.write?.(ansiEscapes.clearTerminal);
        s.remountKey++;
      }, 16);

      return {
        useInitStdout: () => {
          const { stdout } = useStdout();

          s.stdoutRef.current = stdout;

          useEffect(() => refresh, []);
        },
        setStaticHeader: (item: JSX.Element) => ((s.header = item), s.headerSet++),
        setStaticItem: (items: JSX.Element[]) => ((s.state = items), s.stateSet++),
        refreshRemount: refresh,
      };
    },

    withDeepSelector: false,

    withStableSelector: true,
  }
);
