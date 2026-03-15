import { Box } from "ink";
import { memo } from "react";

import { Markdown } from "../markdown";

import type { TextPart } from "@my-agent/core";

export interface TextPartViewProps {
  part: TextPart;
}

/** Render a text part */
export const TextPartView = memo(
  ({ part }: TextPartViewProps) => (
    <Box flexDirection="column">
      <Box paddingLeft={1}>
        <Markdown content={part.content} />
      </Box>
    </Box>
  ),
  (p, n) => p.part.content === n.part.content
);

TextPartView.displayName = "TextPartView";
