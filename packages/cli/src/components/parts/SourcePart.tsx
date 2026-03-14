import { Box, Text } from "ink";

import type { SourceRenderPart } from "@my-agent/core";

export interface SourcePartProps {
  part: SourceRenderPart;
}

export const SourcePart = ({ part }: SourcePartProps) => (
  <Box marginBottom={1}>
    <Text color="blue">[{part.sourceType === "url" ? "URL" : "DOC"}] </Text>
    <Text color="cyan" underline>
      {part.url || part.filename || part.title || part.id}
    </Text>
    {part.title && part.url && (
      <Text color="gray" dimColor>
        {" "}
        - {part.title}
      </Text>
    )}
  </Box>
);
