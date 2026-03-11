import { measureElement } from "ink";
import { debounce } from "lodash-es";
import { useEffect } from "react";
import { createState, markRaw, toRaw } from "reactivity-store";

import { useTerminalSize } from "./useTerminalSize";

import type { DOMElement } from "ink";

export const useHeight = createState(
  () => ({
    state: { header: 0, footer: 0, content: 0, screen: 0 },
    ele: markRaw({
      header: null as null | DOMElement,
      footer: null as null | DOMElement,
    }),
  }),
  {
    withActions: (s) => {
      const useInitTerminalHeight = () => {
        const { rows, columns } = useTerminalSize();

        useEffect(() => {
          s.state.screen = rows;
        }, [rows]);

        return { columns, rows };
      };

      const updateHeader = () => {
        const h = toRaw(s.ele.header);

        if (h) {
          s.state.header = measureElement(h).height;
        } else {
          s.state.header = 0;
        }
      };

      const updateFooter = () => {
        const f = toRaw(s.ele.footer);

        if (f) {
          s.state.footer = measureElement(f).height;
        } else {
          s.state.footer = 0;
        }
      };

      const updateContent = () => {
        const total = s.state.screen;

        s.state.content = total - s.state.header - s.state.footer;
      };

      const updateHeight = debounce(() => {
        updateHeader();
        updateContent();
        updateFooter();
      }, 100);

      const useAutoElementHeight = () => {
        useEffect(() => {
          const cb = useHeight.subscribe((s) => s.state.screen, updateHeight);

          return cb;
        }, []);
      };

      const setHeader = (ele?: DOMElement | null) => {
        s.ele.header = ele || null;
        updateHeight();
      };

      const setFooter = (ele?: DOMElement | null) => {
        s.ele.footer = ele || null;
        updateHeight();
      };

      return {
        useInitTerminalHeight,
        useAutoElementHeight,
        setHeader,
        setFooter,
      };
    },
  }
);
