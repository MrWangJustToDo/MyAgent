import { Box, Text } from "ink";

import type { FileRenderPart } from "@my-agent/core";

export interface FilePartProps {
  part: FileRenderPart;
}

export const FilePart = ({ part }: FilePartProps) => (
  <Box marginBottom={1}>
    <Text color="blue">[FILE] </Text>
    <Text color="gray">{part.mediaType}</Text>
    <Text color="gray" dimColor>
      {" "}
      ({Math.round((part.base64.length * 0.75) / 1024)}KB)
    </Text>
  </Box>
);
