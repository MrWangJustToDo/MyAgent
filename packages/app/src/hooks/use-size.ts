import { useEffect } from "react";
import { createState } from "reactivity-store";

import { useTerminalSize } from "./use-terminal-size.js";

export const useSize = createState(
  () => ({
    state: { screenHeight: 0, screenWidth: 0 },
  }),
  {
    withActions: (s) => {
      const useInitTerminalSize = () => {
        const { columns, rows } = useTerminalSize();

        useEffect(() => {
          s.state.screenWidth = columns;
          s.state.screenHeight = rows;
        }, [columns, rows]);

        return { columns, rows };
      };

      return {
        useInitTerminalSize,
      };
    },
    withDeepSelector: false,

    withStableSelector: true,

    withNamespace: "useSize",
  }
);
