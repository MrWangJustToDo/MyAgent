import { Text } from "ink";
import { useEffect, useState } from "react";

import { formatCompactNumber } from "../utils/format-usage.js";

/** Number of animation ticks before reaching the target */
const TICK_COUNT = 8;

/** Interval between ticks in milliseconds */
const TICK_MS = 60;

/**
 * AnimateNumber — smoothly animates from the previous value to `number`.
 *
 * Step size adapts to the gap: large jumps animate in the same ~480ms as
 * small jumps, by computing `step = ceil(gap / TICK_COUNT)` each tick.
 *
 * Values >= 1000 are displayed in compact form (e.g. "30k", "1.2M").
 */
export const AnimateNumber = ({ number }: { number: number }) => {
  const [current, setCurrent] = useState(number);

  useEffect(() => {
    if (current === number) return;
    // When target decreased (e.g. after reset), snap immediately
    if (current > number) {
      setCurrent(number);
      return;
    }
    const id = setTimeout(() => {
      const gap = number - current;
      const step = Math.max(1, Math.ceil(gap / TICK_COUNT));
      setCurrent(Math.min(current + step, number));
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [number, current]);

  return <Text>{formatCompactNumber(current)}</Text>;
};
