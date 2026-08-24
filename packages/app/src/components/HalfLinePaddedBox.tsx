import { Box, Text } from "ink";

import { useSize } from "../hooks";

import type { ReactNode } from "react";

export interface HalfLinePaddedBoxProps {
  /** Background color for the padded box (hex or named color) */
  backgroundColor: string;
  /** Omit the solid body fill — only the ▄/▀ edge bars keep the tint.
   *  For content that paints its own backgrounds (e.g. diffs). */
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

  return (
    <Box flexDirection="column" width={w}>
      <Text color={backgroundColor}>{"▄".repeat(w)}</Text>
      <Box width={w} backgroundColor={transparentBody ? undefined : backgroundColor}>
        {children}
      </Box>
      <Text color={backgroundColor}>{"▀".repeat(w)}</Text>
    </Box>
  );
};
