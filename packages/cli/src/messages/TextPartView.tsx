import { Box, Text } from "ink";
import { memo } from "react";

import { Markdown } from "../markdown";

import type { TextUIPart, UIMessage } from "ai";

export interface TextPartViewProps {
  part: TextUIPart;
  role: UIMessage["role"];
}

/** Render a text part */
export const TextPartView = memo(
  ({ part, role }: TextPartViewProps) => (
    <Box>
      {role === "user" ? <Text>{"> "}</Text> : <Text>{"- "}</Text>}
      <Markdown content={part.text} />
    </Box>
  ),
  // Custom comparison - only re-render when text actually changes
  (prevProps, nextProps) => prevProps.part.text === nextProps.part.text && prevProps.role === nextProps.role
);

TextPartView.displayName = "TextPartView";
