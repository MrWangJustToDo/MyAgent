import { isFileUIPart, isToolUIPart } from "ai";
import { Box } from "ink";
import { memo, useMemo } from "react";

import { FilePartView } from "./FilePartView.js";
import { TextPartView } from "./TextPartView.js";
import { ThinkingPartView } from "./ThinkingPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";

import type { FileUIPart, ReasoningUIPart, TextUIPart, ToolUIPart, UIMessage } from "ai";

export interface MessageViewProps {
  message: UIMessage;
}

/** Render a single message */
export const MessageView = memo(({ message }: MessageViewProps) => {
  // Memoize filtered parts to avoid recalculation on every render
  const validParts = useMemo(() => message.parts.filter((i) => Object.keys(i).length > 1), [message.parts]);

  // Build a map of file part indices for image numbering
  const fileIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let imageCount = 0;
    validParts.forEach((part, idx) => {
      if (isFileUIPart(part)) {
        const filePart = part as FileUIPart;
        if (filePart.mediaType?.startsWith("image/")) {
          imageCount++;
          map.set(idx, imageCount);
        }
      }
    });
    return map;
  }, [validParts]);

  return (
    <>
      {validParts.map((part, index) => (
        <Box key={`${part.type}-${index}`} width="100%">
          {part.type === "text" && <TextPartView part={part as TextUIPart} role={message.role} />}
          {part.type === "reasoning" && <ThinkingPartView part={part as ReasoningUIPart} />}
          {isFileUIPart(part) && <FilePartView part={part as FileUIPart} index={fileIndexMap.get(index)} />}
          {isToolUIPart(part) && <ToolCallPartView part={part as ToolUIPart} />}
        </Box>
      ))}
    </>
  );
});

MessageView.displayName = "MessageView";
