/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 * Static messages are capped to limit terminal output and improve performance.
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
// Constants
// ============================================================================

/** Maximum number of completed (static) flat parts to render. Older messages are truncated with a summary line. */
const MAX_STATIC_PARTS = 40;

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

  // ── Truncate static list to bounded size ──
  const hiddenPartCount = staticMessages.length > MAX_STATIC_PARTS ? staticMessages.length - MAX_STATIC_PARTS : 0;
  const visibleStaticMessages = hiddenPartCount > 0 ? staticMessages.slice(-MAX_STATIC_PARTS) : staticMessages;
  const visibleStaticLength = visibleStaticMessages.length;

  // Rebuild static list when length changes or merged tool-call state updates earlier rows.
  const lastStaticLengthRef = useRef(0);
  const lastToolCallsSignatureRef = useRef("");
  const lastHiddenCountRef = useRef(0);
  const staticListRef = useRef<JSX.Element[]>([]);

  if (
    visibleStaticLength !== lastStaticLengthRef.current ||
    toolCallsSignature !== lastToolCallsSignatureRef.current ||
    hiddenPartCount !== lastHiddenCountRef.current
  ) {
    lastStaticLengthRef.current = visibleStaticLength;
    lastToolCallsSignatureRef.current = toolCallsSignature;
    lastHiddenCountRef.current = hiddenPartCount;

    const elements = visibleStaticMessages.map((item) => (
      <Box key={item.id} paddingX={1} marginTop={1}>
        <StaticContext value={{ staticMessage: true }}>
          <MessageView message={item} />
        </StaticContext>
      </Box>
    ));

    if (hiddenPartCount > 0) {
      elements.unshift(
        <Box key="truncation-marker" paddingX={1} marginTop={1}>
          <Text color={COLORS.muted} dimColor>
            ... {hiddenPartCount} older message{hiddenPartCount === 1 ? "" : "s"} hidden
          </Text>
        </Box>
      );
    }

    staticListRef.current = elements;
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
  }, [visibleStaticLength, toolCallsSignature, hiddenPartCount]);

  useEffect(() => {
    useDynamic.getActions().setDynamicList(dynamicList);
  });

  return null;
};
