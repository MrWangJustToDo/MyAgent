/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 */

import { Box, Text } from "ink";
import { useEffect, useRef } from "react";

import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { MessageView, StaticContext } from "../messages";
import { COLORS } from "../theme/colors.js";
import { getMessages } from "../utils/get-messages";

import { CursorFlush } from "./CursorFlush";

import type { UIMessage } from "@tanstack/ai";
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
  const { staticMessages, dynamicMessages, toolCallsSignature } = getMessages(messages);

  // Rebuild static list when length changes or merged tool-call state updates earlier rows.
  const lastStaticLengthRef = useRef(0);
  const lastToolCallsSignatureRef = useRef("");
  const staticListRef = useRef<JSX.Element[]>([]);

  if (
    staticMessages.length !== lastStaticLengthRef.current ||
    toolCallsSignature !== lastToolCallsSignatureRef.current
  ) {
    lastStaticLengthRef.current = staticMessages.length;
    lastToolCallsSignatureRef.current = toolCallsSignature;
    staticListRef.current = staticMessages.map((item) => (
      <Box key={item.id} paddingX={1} marginTop={1}>
        <StaticContext value={{ staticMessage: true }}>
          <MessageView message={item} />
        </StaticContext>
      </Box>
    ));
  }

  useEffect(() => {
    useStatic.getActions().setToolCallsSignature(toolCallsSignature);
  }, [toolCallsSignature]);

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
      <Text color={COLORS.muted} dimColor>
        {staticMessages.length ? <CursorFlush /> : "No messages yet. Type a message to start."}
      </Text>
    </Box>
  );

  useEffect(() => {
    useStatic.getActions().setStaticList(staticListRef.current);
  }, [staticMessages.length, toolCallsSignature]);

  useEffect(() => {
    useDynamic.getActions().setDynamicList(dynamicList);
  });

  return null;
};
