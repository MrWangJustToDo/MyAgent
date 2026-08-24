import { Box, Text } from "ink";

import { useSize } from "../hooks";
import { BG } from "../theme/colors.js";

import type { ReactNode } from "react";

export interface HalfLinePaddedBoxProps {
  /** Background color for the padded box (hex or named color) */
  backgroundColor: string;
  /** Keep the half-line spacing bars but paint them with the terminal
   *  background (invisible) and drop the solid body fill — for content
   *  that paints its own backgrounds (e.g. diffs). */
  transparentBody?: boolean;
  /** Content width override (defaults to screenWidth) */
  width?: number;
  children: ReactNode;
}

/**
 * A container with a solid background and half-line padding at the top
 * and bottom using block characters (▄/▀). Inspired by Gemini CLI.
 */
export const HalfLinePaddedBox = ({
  backgroundColor,
  transparentBody,
  width: widthOverride,
  children,
}: HalfLinePaddedBoxProps) => {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const w = widthOverride ?? screenWidth;
  const barColor = transparentBody ? BG.terminal : backgroundColor;

  return (
    <Box flexDirection="column" width={w}>
      <Text color={barColor}>{"▄".repeat(w)}</Text>
      <Box width={w} backgroundColor={transparentBody ? undefined : backgroundColor}>
        {children}
      </Box>
      <Text color={barColor}>{"▀".repeat(w)}</Text>
    </Box>
  );
};
