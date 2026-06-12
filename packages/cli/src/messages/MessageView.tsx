import { isFileUIPart, isToolUIPart } from "ai";
import { Box, Text } from "ink";
import { memo, useMemo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useSize } from "../hooks";

import { FilePartView } from "./FilePartView.js";
import { TextPartView } from "./TextPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";

import type { FileUIPart, TextUIPart, ToolUIPart, UIMessage } from "ai";

const USER_MSG_BG = "#333333";

export interface MessageViewProps {
  message: UIMessage;
}

/** Render a single message */
export const MessageView = memo(({ message }: MessageViewProps) => {
  const validParts = useMemo(() => message.parts.filter((i) => Object.keys(i).length > 1), [message.parts]);

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

  const visibleParts = useMemo(() => validParts.filter((part) => part.type !== "reasoning"), [validParts]);

  if (message.role === "user") {
    return <UserMessageView parts={visibleParts} fileIndexMap={fileIndexMap} />;
  }

  return (
    <>
      {visibleParts.map((part, index) => (
        <Box key={`${part.type}-${index}`} width="100%">
          {part.type === "text" && <TextPartView part={part as TextUIPart} role={message.role} />}
          {isFileUIPart(part) && <FilePartView part={part as FileUIPart} index={fileIndexMap.get(index)} />}
          {isToolUIPart(part) && <ToolCallPartView part={part as ToolUIPart} />}
        </Box>
      ))}
    </>
  );
});

MessageView.displayName = "MessageView";

/**
 * User message — all parts inside a HalfLinePaddedBox for visual separation.
 */
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
    const textParts = parts.filter((p) => p.type === "text") as TextUIPart[];
    const fileParts = parts
      .map((p, i) => (isFileUIPart(p) ? { part: p as FileUIPart, index: i } : null))
      .filter(Boolean) as { part: FileUIPart; index: number }[];

    const text = textParts.map((p) => p.text.trimEnd()).join("\n");
    const prefixWidth = 4;

    return (
      <HalfLinePaddedBox backgroundColor={USER_MSG_BG} width={contentWidth}>
        <Box flexDirection="row" width={contentWidth}>
          <Box width={prefixWidth} flexShrink={0}>
            <Text bold color="white">
              {" > "}
            </Text>
          </Box>
          <Box flexDirection="column" width={contentWidth - prefixWidth}>
            {text && (
              <Text color="white" wrap="wrap">
                {text}
              </Text>
            )}
            {fileParts.length > 0 && (
              <Box gap={1}>
                {fileParts.map(({ part, index }) => (
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
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
