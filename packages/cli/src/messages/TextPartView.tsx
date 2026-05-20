import { Box, Text } from "ink";

import { Markdown } from "../markdown";

import type { TextUIPart, UIMessage } from "ai";

export interface TextPartViewProps {
  part: TextUIPart;
  role: UIMessage["role"];
}

/** Render a text part */
export const TextPartView = ({ part, role }: TextPartViewProps) => (
  <Box flexDirection="row">
    <Box flexShrink={0}>{role === "user" ? <Text>{"> "}</Text> : <Text>{"- "}</Text>}</Box>
    <Markdown content={part.text} />
  </Box>
);
