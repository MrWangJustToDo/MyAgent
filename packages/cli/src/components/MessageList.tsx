/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 */

import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { useStatic } from "../hooks/use-static";
import { MessageView } from "../messages";
import { getMessages } from "../utils/get-messages";

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
  const { staticMessages, dynamicMessages } = useMemo(() => getMessages(messages), [messages]);

  useEffect(() => {
    useStatic.getActions().setStaticList(
      staticMessages.map((item) => (
        <Box key={item.id} paddingX={1} marginTop={1}>
          <MessageView message={item} />
        </Box>
      ))
    );
  }, [staticMessages]);

  if (messages.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>
          No messages yet. Type a message to start.
        </Text>
      </Box>
    );
  }

  return (
    <>
      {dynamicMessages.map((message) => (
        <Box key={message.id} paddingX={1} marginTop={1}>
          <MessageView message={message} addToolApprovalResponse={addToolApprovalResponse} />
        </Box>
      ))}
    </>
  );
};
