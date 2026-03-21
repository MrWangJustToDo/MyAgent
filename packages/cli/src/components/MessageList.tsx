/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 */

import { Box, Text } from "ink";
import { useEffect, useMemo, useRef } from "react";

import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { MessageView } from "../messages";
import { getMessages } from "../utils/get-messages";

import type { UIMessage } from "ai";

// ============================================================================
// Props
// ============================================================================

export interface MessageListProps {
  messages: UIMessage[];
}

// ============================================================================
// Main Component
// ============================================================================

export const MessageList = ({ messages }: MessageListProps) => {
  const { staticMessages, dynamicMessages } = useMemo(() => getMessages(messages), [messages]);

  // Track the last static messages length to detect actual changes
  const lastStaticLengthRef = useRef(0);

  // Memoize static list rendering to prevent unnecessary re-renders
  const staticList = useMemo(
    () =>
      staticMessages.map((item) => (
        <Box key={item.id} paddingX={1} marginTop={1}>
          <MessageView message={item} />
        </Box>
      )),
    [staticMessages]
  );

  // Memoize dynamic list rendering
  const dynamicList = useMemo(
    () =>
      dynamicMessages.length ? (
        dynamicMessages.map((message) => (
          <Box key={message.id} paddingX={1} marginTop={1}>
            <MessageView message={message} />
          </Box>
        ))
      ) : (
        <Box paddingX={1} marginTop={1}>
          <Text color="gray" dimColor>
            No messages yet. Type a message to start.
          </Text>
        </Box>
      ),
    [dynamicMessages]
  );

  // Only update static list when length actually changes
  // This prevents flickering during streaming when static content is stable
  useEffect(() => {
    if (staticMessages.length !== lastStaticLengthRef.current) {
      lastStaticLengthRef.current = staticMessages.length;
      useStatic.getActions().setStaticList(staticList);
    }
  }, [staticMessages.length, staticList]);

  useEffect(() => {
    useDynamic.getActions().setDynamicList(dynamicList);
  }, [dynamicList]);

  return null;
};
