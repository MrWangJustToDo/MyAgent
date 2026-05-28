/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 */

import { Box, Text } from "ink";
import { useEffect, useMemo, useRef } from "react";

import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { MessageView, StaticContext } from "../messages";
import { getMessages } from "../utils/get-messages";

import type { UIMessage } from "ai";
import type { JSX } from "react";

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

  // Only rebuild static list JSX when its length changes (new items appended).
  // This avoids re-creating the entire static JSX tree on every streaming tick.
  const lastStaticLengthRef = useRef(0);
  const staticListRef = useRef<JSX.Element[]>([]);

  if (staticMessages.length !== lastStaticLengthRef.current) {
    lastStaticLengthRef.current = staticMessages.length;
    staticListRef.current = staticMessages.map((item) => (
      <Box key={item.id} paddingX={1} marginTop={1}>
        <StaticContext value={{ staticMessage: true }}>
          <MessageView message={item} />
        </StaticContext>
      </Box>
    ));
  }

  // Dynamic list — actively streaming/executing parts that change frequently
  const dynamicList = dynamicMessages.length ? (
    dynamicMessages.map((message) => (
      <Box key={message.id} paddingX={1} marginTop={1}>
        <StaticContext value={{ staticMessage: false }}>
          <MessageView message={message} />
        </StaticContext>
      </Box>
    ))
  ) : (
    <Box paddingX={1} marginTop={1}>
      <Text color="gray" dimColor>
        No messages yet. Type a message to start.
      </Text>
    </Box>
  );

  useEffect(() => {
    useStatic.getActions().setStaticList(staticListRef.current);
  }, [staticMessages.length]);

  useEffect(() => {
    useDynamic.getActions().setDynamicList(dynamicList);
  });

  return null;
};
