import { debounce } from "lodash-es";
import { useLayoutEffect, useState } from "react";

import { useAgentLog } from "./use-agent-log";

const TERMINAL_PADDING_X = 4;

const getValidSize = (size: number): number => {
  if (size % 2 === 0) {
    return size;
  } else {
    return size - 1; // Ensure even number of columns
  }
};

export function useTerminalSize(): { columns: number } {
  const [size, setSize] = useState(() => getValidSize((process.stdout.columns || 60) - TERMINAL_PADDING_X));

  useLayoutEffect(() => {
    function updateSize() {
      const terminalWidth = getValidSize((process.stdout.columns || 60) - TERMINAL_PADDING_X);

      setSize(terminalWidth);
    }

    updateSize();

    const debounceUpdateSize = debounce(() => {
      useAgentLog.getReactiveState().log?.chat?.("resize ui");
      updateSize();
    }, 200);

    process.stdout.on("resize", debounceUpdateSize);
    return () => {
      process.stdout.off("resize", debounceUpdateSize);
    };
  }, []);

  return { columns: size };
}
