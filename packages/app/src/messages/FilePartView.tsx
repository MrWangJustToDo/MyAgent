import { Box, Text } from "ink";
import { memo } from "react";

import { COLORS } from "../theme/colors.js";

import type { ImagePart } from "@tanstack/ai";

export interface FilePartViewProps {
  part: ImagePart;
  /** 1-based index for display (e.g., "Image #1") */
  index?: number;
}

function getImageUrl(part: ImagePart): string {
  if (part.source.type === "url") return part.source.value;
  if (part.source.type === "data") return part.source.value;
  return "";
}

function formatFileSize(dataUrl: string): string {
  const base64Match = dataUrl.match(/;base64,(.+)/);
  if (!base64Match) return "";
  const bytes = Math.ceil((base64Match[1].length * 3) / 4);
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Render an image attachment part in a message */
export const FilePartView = memo(({ part, index }: FilePartViewProps) => {
  const url = getImageUrl(part);
  const mediaType = (part.metadata as { mediaType?: string } | undefined)?.mediaType ?? "image/*";
  const filename = (part.metadata as { filename?: string } | undefined)?.filename;
  const isImage = mediaType.startsWith("image/");
  const size = formatFileSize(url);
  const label = isImage && index !== undefined ? `[Image #${index}]` : isImage ? "[IMG]" : "[FILE]";

  return (
    <Box gap={1}>
      <Text color={isImage ? COLORS.accent : COLORS.primary}>{label}</Text>
      {!isImage && <Text>{filename || "unnamed"}</Text>}
      {size && (
        <Text color={COLORS.muted} dimColor>
          ({size})
        </Text>
      )}
    </Box>
  );
});

FilePartView.displayName = "FilePartView";
