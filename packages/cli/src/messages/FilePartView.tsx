import { Box, Text } from "ink";
import { memo } from "react";

import type { FileUIPart } from "ai";

export interface FilePartViewProps {
  part: FileUIPart;
}

function formatFileSize(dataUrl: string): string {
  // Estimate size from base64 data URL
  const base64Match = dataUrl.match(/;base64,(.+)/);
  if (!base64Match) return "";
  const bytes = Math.ceil((base64Match[1].length * 3) / 4);
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Render a file attachment part in a message */
export const FilePartView = memo(({ part }: FilePartViewProps) => {
  const isImage = part.mediaType?.startsWith("image/");
  const size = formatFileSize(part.url);

  return (
    <Box gap={1}>
      <Text color={isImage ? "magenta" : "cyan"}>{isImage ? "[IMG]" : "[FILE]"}</Text>
      <Text>{part.filename || "unnamed"}</Text>
      {size && (
        <Text color="gray" dimColor>
          ({size})
        </Text>
      )}
    </Box>
  );
});

FilePartView.displayName = "FilePartView";
