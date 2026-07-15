import { Box, Text } from "ink";
import { memo, useMemo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useSize } from "../hooks";
import { BG, COLORS } from "../theme/colors.js";
import { isActivitySummaryMessage } from "../utils/project-transcript.js";
import { isImagePart, isToolCallPart } from "../utils/tool-part.js";

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

/** Render a single message */
export const MessageView = memo(({ message, readOnly = false }: MessageViewProps) => {
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
    return summary ? <ActivitySummaryView summary={summary} /> : null;
  }

  if (message.role === "user") {
    return <UserMessageView parts={visibleParts} fileIndexMap={fileIndexMap} />;
  }

  if (visibleParts.length === 0) return null;

  return (
    <>
      {visibleParts.map((part, index) => (
        <Box key={`${part.type}-${index}`} width="100%">
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
            {text && (
              <Text color={COLORS.text} wrap="wrap">
                {text}
              </Text>
            )}
            {fileParts.length > 0 && (
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
