import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";
import { memo } from "react";

import { useSize } from "../hooks";
import { BG } from "../theme/colors";
import { markdownTheme } from "../theme/markdown-theme.js";

import type { TextPart, UIMessage } from "../hooks";

export const CompactionSummaryView = memo(function CompactionSummaryView({ message }: { message: UIMessage }) {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const contentWidth = screenWidth - 2;

  const part = message.parts[0] as TextPart;

  return (
    <Box
      flexDirection="column"
      width={contentWidth}
      borderStyle="single"
      borderColor={BG.border}
      borderTop
      borderBottom
      padding={1}
    >
      <Box justifyContent="center" width={"100%"}>
        <Text>── compact checkpoint ──</Text>
      </Box>
      <StreamMarkdown theme={{ ...markdownTheme, width: contentWidth - 2 }}>{part.content.trimEnd()}</StreamMarkdown>
    </Box>
  );
});

CompactionSummaryView.displayName = "CompactionSummaryView";
