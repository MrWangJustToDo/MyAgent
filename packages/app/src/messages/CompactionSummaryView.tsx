import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";
import { memo } from "react";

import { useSize } from "../hooks";
import { BG } from "../theme/colors";
import { markdownTheme } from "../theme/markdown-theme.js";
import { extractCompactionSummaryBody } from "../utils/compaction-summary.js";

import type { TextPart, UIMessage } from "../hooks";

export const CompactionSummaryView = memo(function CompactionSummaryView({ message }: { message: UIMessage }) {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const contentWidth = screenWidth - 2;

  const part = message.parts[0] as TextPart;
  // Strip the outer [CONVERSATION SUMMARY] / [END SUMMARY] markers and
  // "Continue if you have next steps..." instruction — we already have our
  // own visual header (── compact checkpoint ──).
  const displayContent = extractCompactionSummaryBody(part.content) ?? part.content;

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
      <StreamMarkdown theme={{ ...markdownTheme, width: contentWidth - 2 }}>{displayContent.trimEnd()}</StreamMarkdown>
    </Box>
  );
});

CompactionSummaryView.displayName = "CompactionSummaryView";
