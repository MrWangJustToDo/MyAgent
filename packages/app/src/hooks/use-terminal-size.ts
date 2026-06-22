import { useStdout } from "ink";
import { debounce } from "lodash-es";
import { useLayoutEffect, useState } from "react";

import { useAgentLog } from "./use-agent-log.js";

const TERMINAL_PADDING_X = 4;

const getValidSize = (size: number): number => {
  if (size % 2 === 0) {
    return size;
  } else {
    return size - 1;
  }
};

export function useTerminalSize(): { columns: number } {
  const { stdout } = useStdout();

  const [size, setSize] = useState(() => getValidSize(stdout?.columns || 60 - TERMINAL_PADDING_X));

  useLayoutEffect(() => {
    if (!stdout) return;

    function updateSize() {
      setSize(getValidSize(stdout?.columns || 60 - TERMINAL_PADDING_X));
    }

    updateSize();

    const debounceUpdateSize = debounce(() => {
      useAgentLog.getReactiveState().log?.chat?.("resize ui");
      updateSize();
    }, 200);

    stdout.on("resize", debounceUpdateSize);
    return () => {
      stdout.off("resize", debounceUpdateSize);
    };
  }, [stdout]);

  return { columns: size };
}
