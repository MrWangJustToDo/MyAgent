import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";

import { useSize } from "../hooks";

import type { TextUIPart, UIMessage } from "ai";

export interface TextPartViewProps {
  part: TextUIPart;
  role: UIMessage["role"];
}

/** Render a text part */
export const TextPartView = ({ part, role }: TextPartViewProps) => {
  const width = useSize((s) => s.state.screenWidth);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>{role === "user" ? <Text>{"> "}</Text> : <Text>{"- "}</Text>}</Box>
      <StreamMarkdown theme={{ width: width - 2 }}>{part.text}</StreamMarkdown>
    </Box>
  );
};
