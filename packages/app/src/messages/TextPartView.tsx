import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";

import { useSize } from "../hooks";
import { COLORS } from "../theme/colors.js";
import { markdownTheme } from "../theme/markdown-theme.js";

import type { TextPart } from "@tanstack/ai";

export interface TextPartViewProps {
  part: TextPart;
  role: string;
}

/** Render a text part for assistant messages (user messages are handled by UserMessageView) */
export const TextPartView = ({ part }: TextPartViewProps) => {
  const width = useSize((s) => s.state.screenWidth);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text color={COLORS.accent}>{"✦ "}</Text>
      </Box>
      <StreamMarkdown theme={{ ...markdownTheme, width: width - 6 }}>{part.content.trimEnd()}</StreamMarkdown>
    </Box>
  );
};
