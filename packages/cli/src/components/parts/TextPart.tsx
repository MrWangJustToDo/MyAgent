import { Box } from "ink";

import { Markdown } from "../../markdown";

import type { TextRenderPart } from "@my-agent/core";

export interface TextPartProps {
  part: TextRenderPart;
}

export const TextPart = ({ part }: TextPartProps) => (
  <Box flexDirection="column" marginBottom={1}>
    <Box paddingLeft={1}>
      <Markdown content={part.text + (part.isComplete ? "" : "...")} />
    </Box>
  </Box>
);
