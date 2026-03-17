import { Box, Text } from "ink";

import { Markdown } from "../markdown";

import type { UIMessage } from "ai";

/**
 * Text part from AI SDK
 */
export interface TextUIPart {
  type: "text";
  text: string;
  state?: "streaming" | "done";
}

export interface TextPartViewProps {
  part: TextUIPart;
  role: UIMessage["role"];
}

/** Render a text part */
export const TextPartView = ({ part, role }: TextPartViewProps) => (
  <Box>
    {role === "user" ? <Text>{"> "}</Text> : <Text>{"- "}</Text>}
    <Markdown content={part.text} />
  </Box>
);
