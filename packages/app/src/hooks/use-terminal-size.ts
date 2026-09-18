import { useStdout } from "ink";
import { debounce } from "lodash-es";
import { useLayoutEffect, useState } from "react";

const TERMINAL_PADDING_X = 4;

const getValidSize = (size: number): number => {
  if (size % 2 === 0) {
    return size;
  } else {
    return size - 1;
  }
};

export const getSize = (stdout: NodeJS.WriteStream) => {
  return {
    columns: getValidSize(stdout?.columns || 60 - TERMINAL_PADDING_X),
    rows: stdout?.rows || 24,
  };
};

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();

  const [size, setSize] = useState(() => getSize(stdout));

  useLayoutEffect(() => {
    if (!stdout) return;

    function updateSize() {
      setSize(getSize(stdout));
    }

    updateSize();

    const debounceUpdateSize = debounce(() => {
      updateSize();
    }, 200);

    stdout.on("resize", debounceUpdateSize);
    return () => {
      stdout.off("resize", debounceUpdateSize);
    };
  }, [stdout]);

  return { columns: size.columns, rows: size.rows };
}
