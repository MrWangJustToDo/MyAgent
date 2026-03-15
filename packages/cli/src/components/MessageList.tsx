/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses TanStack AI's UIMessage format with parts (text, tool-call, tool-result, thinking).
 */

import { Box, Text } from "ink";

import { MessageView } from "../messages";

import type { ApprovalInputsMap } from "../hooks";
import type { UIMessage } from "@my-agent/core";

// ============================================================================
// Props
// ============================================================================

export interface MessageListProps {
  messages: UIMessage[];
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  /** Map of toolCallId -> input for pending approvals */
  approvalInputs?: ApprovalInputsMap;
}

// ============================================================================
// Main Component
// ============================================================================

export const MessageList = ({ messages, addToolApprovalResponse, approvalInputs }: MessageListProps) => {
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
    <Box flexDirection="column" rowGap={1}>
      {messages.map((message) => (
        <Box key={message.id}>
          <MessageView
            message={message}
            addToolApprovalResponse={addToolApprovalResponse}
            approvalInputs={approvalInputs}
          />
        </Box>
      ))}
    </Box>
  );
};
