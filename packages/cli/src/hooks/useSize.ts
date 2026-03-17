import { useEffect, useRef } from "react";
import { createState } from "reactivity-store";

import { useStatic } from "./useStatic";
import { useTerminalSize } from "./useTerminalSize";

export const useSize = createState(
  () => ({
    state: { screenHeight: 0, screenWidth: 0 },
  }),
  {
    withActions: (s) => {
      const useInitTerminalSize = () => {
        const initMountRef = useRef(true);

        const { rows, columns } = useTerminalSize();

        useEffect(() => {
          s.state.screenHeight = rows;

          s.state.screenWidth = columns;

          if (initMountRef.current) {
            initMountRef.current = false;
            return;
          }

          const id = setTimeout(() => {
            useStatic.getActions().refreshRemount();
          }, 300);

          return () => clearTimeout(id);
        }, [rows, columns]);

        return { columns, rows };
      };

      return {
        useInitTerminalSize,
      };
    },
    withDeepSelector: false,

    withStableSelector: true,

    withNamespace: "useHeight",
  }
);
