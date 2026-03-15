import { Box, Text } from "ink";
import { memo } from "react";

import { TextPartView } from "./TextPartView.js";
import { ThinkingPartView } from "./ThinkingPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";
import { ToolResultPartView } from "./ToolResultPartView.js";

import type { ApprovalInputsMap } from "../../hooks";
import type { TextPart, ThinkingPart, ToolCallPart, ToolResultPart, UIMessage } from "@my-agent/core";

export interface MessageViewProps {
  message: UIMessage;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  /** Map of toolCallId -> input for pending approvals */
  approvalInputs?: ApprovalInputsMap;
}

/** Render a single message */
export const MessageView = memo(({ message, addToolApprovalResponse, approvalInputs }: MessageViewProps) => {
  const isUser = message.role === "user";

  return (
    <Box flexDirection="column">
      {/* Role header */}
      <Box>
        <Text color={isUser ? "green" : "cyan"} bold>
          {isUser ? "You" : "Assistant"}:
        </Text>
      </Box>

      {/* Parts */}
      <Box flexDirection="column" paddingLeft={1} rowGap={1}>
        {message.parts.map((part, index) => (
          <Box key={`${part.type}-${index}`}>
            {part.type === "text" && <TextPartView part={part as TextPart} />}
            {part.type === "thinking" && <ThinkingPartView part={part as ThinkingPart} />}
            {part.type === "tool-call" && (
              <ToolCallPartView
                part={part as ToolCallPart}
                addToolApprovalResponse={addToolApprovalResponse}
                approvalInput={approvalInputs?.get((part as ToolCallPart).id)}
              />
            )}
            {part.type === "tool-result" && <ToolResultPartView part={part as ToolResultPart} />}
          </Box>
        ))}
      </Box>
    </Box>
  );
});

MessageView.displayName = "MessageView";
