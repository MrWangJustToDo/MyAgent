import { Box, Text } from "ink";
import { memo, useMemo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useSize } from "../hooks";
import { BG, COLORS } from "../theme/colors.js";
import { formatFileSize } from "../utils/format.js";
import { getImageUrl, getTextContent } from "../utils/get-messages.js";
import { isImagePart } from "../utils/tool-part.js";
import { formatImageChipLabel, parseUserMessageSegments } from "../utils/user-message-images.js";

import { FilePartView } from "./FilePartView.js";

import type { ImagePart, TextPart } from "@tanstack/ai";

export const UserMessageView = memo(
  ({
    parts,
    fileIndexMap,
  }: {
    parts: ReturnType<typeof Array.prototype.filter>;
    fileIndexMap: Map<number, number>;
  }) => {
    const screenWidth = useSize((s) => s.state.screenWidth);
    const contentWidth = screenWidth - 2;
    const textParts = parts.filter((p) => p.type === "text") as TextPart[];
    const fileParts = parts
      .map((p, i) => (isImagePart(p) ? { part: p as ImagePart, index: i } : null))
      .filter(Boolean) as { part: ImagePart; index: number }[];

    const text = textParts.map((p) => getTextContent(p)).join("\n");
    const segments = useMemo(() => parseUserMessageSegments(text), [text]);
    const hasInlineRefs = segments.some((s) => s.type === "image");

    const sizeByDisplayIndex = useMemo(() => {
      const map = new Map<number, string>();
      for (const { part, index } of fileParts) {
        const displayIndex = fileIndexMap.get(index);
        if (displayIndex === undefined) continue;
        const size = formatFileSize(getImageUrl(part));
        if (size) map.set(displayIndex, size);
      }
      return map;
    }, [fileParts, fileIndexMap]);

    const prefixWidth = 4;

    return (
      <HalfLinePaddedBox backgroundColor={BG.message} width={contentWidth}>
        <Box flexDirection="row" width={contentWidth}>
          <Box width={prefixWidth} flexShrink={0}>
            <Text bold color={COLORS.accent}>
              {" > "}
            </Text>
          </Box>
          <Box flexDirection="column" width={contentWidth - prefixWidth}>
            {(text || hasInlineRefs) && (
              <Text color={COLORS.text} wrap="wrap">
                {segments.map((segment, i) => {
                  if (segment.type === "text") {
                    return segment.content;
                  }
                  const size = sizeByDisplayIndex.get(segment.displayIndex);
                  return (
                    <Text key={`img-${segment.displayIndex}-${i}`} color={COLORS.accent}>
                      {formatImageChipLabel(segment.displayIndex)}
                      {size ? (
                        <Text color={COLORS.muted} dimColor>
                          {` (${size})`}
                        </Text>
                      ) : null}
                    </Text>
                  );
                })}
              </Text>
            )}
            {/* Legacy sessions: images without inline refs still render as a trailing row */}
            {!hasInlineRefs && fileParts.length > 0 && (
              <Box gap={1}>
                {fileParts.map(({ part, index }) => (
                  <FilePartView key={index} part={part} index={fileIndexMap.get(index)} />
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </HalfLinePaddedBox>
    );
  }
);

UserMessageView.displayName = "UserMessageView";
