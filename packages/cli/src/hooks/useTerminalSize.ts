import { debounce } from "lodash-es";
import { useLayoutEffect, useState } from "react";

import { useAgentLog } from "./useAgentLog";

const TERMINAL_PADDING_X = 4;

const getValidSize = (size: number): number => {
  if (size % 2 === 0) {
    return size;
  } else {
    return size - 1; // Ensure even number of columns
  }
};

export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState({
    columns: 0,
    rows: process.stdout.rows || 20,
  });

  useLayoutEffect(() => {
    function updateSize() {
      const terminalWidth = getValidSize((process.stdout.columns || 60) - TERMINAL_PADDING_X);

      const terminalHeight = getValidSize(process.stdout.rows || 20);

      setSize({
        columns: terminalWidth,
        rows: terminalHeight,
      });
    }

    updateSize();

    const debounceUpdateSize = debounce(() => {
      useAgentLog.getReactiveState().log?.agent("resize call");
      updateSize();
    }, 16);

    process.stdout.on("resize", debounceUpdateSize);
    return () => {
      process.stdout.off("resize", debounceUpdateSize);
    };
  }, []);

  return size;
}
