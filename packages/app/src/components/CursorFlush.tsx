/**
 * CursorFlush - A blinking terminal cursor indicator.
 *
 * Renders a subtle blinking block cursor to indicate the system is active
 * and about to flush output. This replaces redundant "Loading..." spinners
 * when the footer already provides status feedback.
 */

import { Text } from "ink";
import { useState, useEffect } from "react";

import { COLORS } from "../theme/colors.js";

const CURSOR_CHARS = ["▌", " "] as const;
const BLINK_INTERVAL = 530;

export const CursorFlush = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((prev) => !prev);
    }, BLINK_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={COLORS.muted} dimColor>
      {visible ? CURSOR_CHARS[0] : CURSOR_CHARS[1]}
    </Text>
  );
};
