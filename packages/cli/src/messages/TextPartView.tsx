import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";

import { useSize } from "../hooks";

import type { TextUIPart } from "ai";

export interface TextPartViewProps {
  part: TextUIPart;
  role: string;
}

/** Render a text part for assistant messages (user messages are handled by UserMessageView) */
export const TextPartView = ({ part }: TextPartViewProps) => {
  const width = useSize((s) => s.state.screenWidth);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text>{"✦ "}</Text>
      </Box>
      <StreamMarkdown theme={{ width: width - 2 }}>{part.text.trimEnd()}</StreamMarkdown>
    </Box>
  );
};
