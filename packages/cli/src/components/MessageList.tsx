/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 */

import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { useStatic } from "../hooks/useStatic";
import { MessageView } from "../messages";

import type { UIMessage } from "ai";

// ============================================================================
// Props
// ============================================================================

export interface MessageListProps {
  messages: UIMessage[];
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const MessageList = ({ messages, addToolApprovalResponse }: MessageListProps) => {
  const staticList = useMemo(() => messages.slice(0, -1), [messages.length]);

  useEffect(() => {
    useStatic.getActions().setStaticItem(
      staticList.map((item) => (
        <Box key={item.id} paddingX={1} marginY={1}>
          <MessageView message={item} staticItem />
        </Box>
      ))
    );
  }, [staticList]);

  if (messages.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>
          No messages yet. Type a message to start.
        </Text>
      </Box>
    );
  }

  const current = messages.slice(-1);

  return (
    <>
      {current.map((message) => (
        <Box key={message.id} paddingX={1} marginY={1}>
          <MessageView message={message} addToolApprovalResponse={addToolApprovalResponse} />
        </Box>
      ))}
    </>
  );
};
