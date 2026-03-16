import { Box, Text } from "ink";
import { memo } from "react";

import { Markdown } from "../markdown";

import type { TextPart, UIMessage } from "@my-agent/core";

export interface TextPartViewProps {
  part: TextPart;
  role: UIMessage["role"];
}

/** Render a text part */
export const TextPartView = memo(
  ({ part, role }: TextPartViewProps) => (
    <Box>
      {role === "user" ? <Text>{"> "}</Text> : <Text>{"⏺ "}</Text>}
      <Markdown content={part.content} />
    </Box>
  ),
  (p, n) => p.part.content === n.part.content
);

TextPartView.displayName = "TextPartView";
