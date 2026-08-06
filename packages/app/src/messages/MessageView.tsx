import { isCompactionSummaryUIMessage } from "@my-agent/core";
import { Box } from "ink";
import { memo, useMemo } from "react";

import { useTheme } from "../hooks/use-theme.js";
import { getTextContent } from "../utils/get-messages.js";
import { isActivitySummaryMessage } from "../utils/project-transcript.js";
import { isImagePart, isToolCallPart } from "../utils/tool-part.js";

import { ActivitySummaryView } from "./ActivitySummaryView.js";
import { CompactionSummaryView } from "./CompactionSummaryView.js";
import { FilePartView } from "./FilePartView.js";
import { TextPartView } from "./TextPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";
import { UserMessageView } from "./UserMessageView.js";

import type { ImagePart, TextPart, UIMessage } from "@tanstack/ai";

export interface MessageViewProps {
  message: UIMessage;
  /** Read-only mode for nested subagent previews (no approval prompts). */
  readOnly?: boolean;
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

  if (isCompactionSummaryUIMessage(message)) {
    return <CompactionSummaryView key={theme} message={message} />;
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
