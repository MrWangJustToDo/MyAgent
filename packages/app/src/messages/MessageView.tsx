import { Box, Text } from "ink";
import { memo, useMemo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useSize } from "../hooks";
import { useTheme } from "../hooks/use-theme.js";
import { BG, COLORS } from "../theme/colors.js";
import { isActivitySummaryMessage } from "../utils/project-transcript.js";
import { isImagePart, isToolCallPart } from "../utils/tool-part.js";
import { formatImageChipLabel, parseUserMessageSegments } from "../utils/user-message-images.js";

import { ActivitySummaryView } from "./ActivitySummaryView.js";
import { FilePartView } from "./FilePartView.js";
import { TextPartView } from "./TextPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";

import type { ImagePart, TextPart, UIMessage } from "@tanstack/ai";

export interface MessageViewProps {
  message: UIMessage;
  /** Read-only mode for nested subagent previews (no approval prompts). */
  readOnly?: boolean;
}

function getTextContent(part: TextPart): string {
  return part.content?.trim() ?? "";
}

function getImageUrl(part: ImagePart): string {
  if (part.source.type === "url") return part.source.value;
  if (part.source.type === "data") return part.source.value;
  return "";
}

function formatFileSize(dataUrl: string): string {
  const base64Match = dataUrl.match(/;base64,(.+)/);
  if (!base64Match) return "";
  const bytes = Math.ceil((base64Match[1]!.length * 3) / 4);
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Render a single message */
export const MessageView = memo(({ message, readOnly = false }: MessageViewProps) => {
  const theme = useTheme((s) => s.theme);

  const validParts = useMemo(() => message.parts.filter((i) => Object.keys(i).length > 1), [message.parts]);

  const visibleParts = useMemo(
    () =>
      validParts.filter((part) => {
        if (part.type === "thinking") return false;
        if (part.type === "tool-result") return false;
        if (part.type === "text") {
          return getTextContent(part as TextPart).length > 0;
        }
        return true;
      }),
    [validParts]
  );

  const fileIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let imageCount = 0;
    visibleParts.forEach((part, idx) => {
      if (isImagePart(part)) {
        imageCount++;
        map.set(idx, imageCount);
      }
    });
    return map;
  }, [visibleParts]);

  if (isActivitySummaryMessage(message)) {
    const summary = visibleParts[0]?.type === "text" ? getTextContent(visibleParts[0] as TextPart) : "";
    return summary ? <ActivitySummaryView key={theme} summary={summary} /> : null;
  }

  if (message.role === "user") {
    return <UserMessageView key={theme} parts={visibleParts} fileIndexMap={fileIndexMap} />;
  }

  if (visibleParts.length === 0) return null;

  return (
    <>
      {visibleParts.map((part, index) => (
        <Box key={`${theme}-${part.type}-${index}`} width="100%">
          {part.type === "text" && <TextPartView part={part as TextPart} role={message.role} />}
          {isImagePart(part) && <FilePartView part={part as ImagePart} index={fileIndexMap.get(index)} />}
          {isToolCallPart(part) && <ToolCallPartView part={part} readOnly={readOnly} />}
        </Box>
      ))}
    </>
  );
});

MessageView.displayName = "MessageView";

const UserMessageView = memo(
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
