/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses TanStack AI's UIMessage format with parts (text, tool-call, tool-result, thinking).
 */

import { Box, Text } from "ink";

import { MessageView } from "./message";

import type { UIMessage } from "@my-agent/core";

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
    <Box flexDirection="column">
      {messages.map((message) => (
        <Box key={message.id}>
          <MessageView message={message} addToolApprovalResponse={addToolApprovalResponse} />
        </Box>
      ))}
    </Box>
  );
};
