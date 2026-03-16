import { Box } from "ink";
import { memo } from "react";

import { TextPartView } from "./TextPartView.js";
import { ThinkingPartView } from "./ThinkingPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";
// import { ToolResultPartView } from "./ToolResultPartView.js";

import type { ApprovalInputsMap } from "../hooks";
import type { TextPart, ThinkingPart, ToolCallPart, UIMessage } from "@my-agent/core";

export interface MessageViewProps {
  message: UIMessage;
  staticItem?: boolean;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  /** Map of toolCallId -> input for pending approvals */
  approvalInputs?: ApprovalInputsMap;
}

/** Render a single message */
export const MessageView = memo(
  ({ message, addToolApprovalResponse, approvalInputs, staticItem }: MessageViewProps) => {
    return (
      <Box flexDirection="column" rowGap={1}>
        {message.parts.map((part, index) => (
          <Box key={`${part.type}-${index}`}>
            {part.type === "text" && <TextPartView part={part as TextPart} role={message.role} />}
            {part.type === "thinking" && <ThinkingPartView part={part as ThinkingPart} />}
            {part.type === "tool-call" && (
              <ToolCallPartView
                part={part as ToolCallPart}
                staticItem={staticItem}
                addToolApprovalResponse={addToolApprovalResponse}
                approvalInput={approvalInputs?.get((part as ToolCallPart).id)}
              />
            )}
            {/* {part.type === "tool-result" && <ToolResultPartView part={part as ToolResultPart} />} */}
          </Box>
        ))}
      </Box>
    );
  }
);

MessageView.displayName = "MessageView";
