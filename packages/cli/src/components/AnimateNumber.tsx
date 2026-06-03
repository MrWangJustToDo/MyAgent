import { Text } from "ink";
import { useEffect, useState } from "react";

/** Number of animation ticks before reaching the target */
const TICK_COUNT = 8;

/** Interval between ticks in milliseconds */
const TICK_MS = 60;

/**
 * Format a number into compact human-readable form.
 * - 0–999 → raw (e.g. "342")
 * - 1,000–999,999 → "1.50k", "342.00k" (two decimal places)
 * - 1,000,000+ → "1.20M", "3.55M" (two decimal places)
 */
const formatCompact = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    // Thousands — show two decimal places
    const thousands = n / 1000;
    const rounded = Math.round(thousands * 100) / 100;
    return `${rounded.toFixed(2)}k`;
  }
  // Millions — show two decimal places
  const millions = n / 1_000_000;
  const rounded = Math.round(millions * 100) / 100;
  return `${rounded.toFixed(2)}M`;
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
