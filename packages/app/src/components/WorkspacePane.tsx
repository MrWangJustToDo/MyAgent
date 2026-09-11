import { Box, Text } from "ink";

import { BG, COLORS } from "../theme/colors.js";

import type { ReactNode } from "react";

/** Lines reserved for an optional pane title (kept in sync with its box height). */
export const PANE_TITLE_LINES = 0;

/**
 * Bordered shell for one workspace pane (tree or preview). The active pane gets
 * the primary border color; `width` omitted lets the pane flex to fill.
 */
export const WorkspacePane = ({
  title,
  active,
  width,
  height,
  children,
}: {
  title?: string;
  active: boolean;
  width: number | undefined;
  height: number;
  children: ReactNode;
}) => (
  <Box
    flexDirection="column"
    width={width}
    height={height}
    flexGrow={width ? 0 : 1}
    flexShrink={0}
    borderStyle="single"
    borderColor={active ? COLORS.primary : BG.border}
  >
    {title && (
      <Box flexShrink={0} paddingX={1} height={PANE_TITLE_LINES}>
        <Text bold color={active ? COLORS.primary : COLORS.muted}>
          {title}
        </Text>
      </Box>
    )}
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      {children}
    </Box>
  </Box>
);
