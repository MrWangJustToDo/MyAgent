import { Text } from "ink";
import { useEffect, useState } from "react";

/** Number of animation ticks before reaching the target */
const TICK_COUNT = 8;

/** Interval between ticks in milliseconds */
const TICK_MS = 60;

/**
 * Format a number into compact human-readable form.
 * - 0–999 → raw (e.g. "342")
 * - 1,000–999,999 → "1k", "342k" (no decimal)
 * - 1,000,000+ → "1.2M", "3.5M" (one decimal)
 */
const formatCompact = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    // Round to nearest thousand, show without decimal
    const thousands = Math.round(n / 1000);
    return `${thousands}k`;
  }
  // Millions — show one decimal place
  const millions = n / 1_000_000;
  // Round to 1 decimal place
  const rounded = Math.round(millions * 10) / 10;
  return `${rounded}M`;
};

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
    if (current >= number) return;
    const id = setTimeout(() => {
      const gap = number - current;
      // When the gap is large, take bigger steps so the animation
      // finishes in roughly the same number of ticks regardless of distance.
      const step = Math.max(1, Math.ceil(gap / TICK_COUNT));
      setCurrent(Math.min(current + step, number));
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [number, current]);

  return <Text>{formatCompact(current)}</Text>;
};
