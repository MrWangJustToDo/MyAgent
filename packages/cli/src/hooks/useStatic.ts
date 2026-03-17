import ansiEscapes from "ansi-escapes";
import { useStdout, getExistInstance } from "ink";
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
    cache: {
      header: null as null | JSX.Element,
      state: [] as JSX.Element[],
    },
  }),
  {
    withActions(s) {
      const setToCache = () => {
        s.cache.header = s.header;
        s.cache.state = s.state;
        s.header = null;
        s.state = [];
      };

      const restoreCache = () => {
        s.header = s.cache.header;
        s.state = s.state.length ? s.state : s.cache.state;
      };

      const refresh = debounce(() => {
        const stdout = toRaw(s.stdoutRef.current);
        stdout?.write?.(ansiEscapes.clearTerminal);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const inkInstance = getExistInstance(stdout);
        if (inkInstance) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          inkInstance.fullStaticOutput = "";
        }
        s.remountKey++;
      }, 16);

      return {
        useInitStdout: () => {
          const { stdout } = useStdout();

          s.stdoutRef.current = stdout;

          useEffect(() => refresh, []);
        },
        setToCache,
        restoreCache,
        setStaticHeader: (item: JSX.Element) => ((s.header = item), s.headerSet++),
        setStaticItem: (items: JSX.Element[]) => ((s.state = items), s.stateSet++),
        refreshRemount: refresh,
      };
    },

    withDeepSelector: false,

    withStableSelector: true,
  }
);
