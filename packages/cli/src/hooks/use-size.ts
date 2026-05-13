import { useEffect } from "react";
import { createState } from "reactivity-store";

import { useTerminalSize } from "./use-terminal-size";

export const useSize = createState(
  () => ({
    state: { screenHeight: 0, screenWidth: 0 },
  }),
  {
    withActions: (s) => {
      const useInitTerminalSize = () => {
        const { columns } = useTerminalSize();

        useEffect(() => {
          s.state.screenWidth = columns;
        }, [columns]);

        return { columns };
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
