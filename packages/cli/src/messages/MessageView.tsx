import { Box } from "ink";

import { TextPartView } from "./TextPartView.js";
import { ThinkingPartView } from "./ThinkingPartView.js";
import { ToolCallPartView } from "./ToolCallPartView.js";

import type { TextUIPart } from "./TextPartView.js";
import type { ReasoningUIPart } from "./ThinkingPartView.js";
import type { ToolInvocationUIPart } from "./ToolCallPartView.js";
import type { UIMessage } from "ai";

export interface MessageViewProps {
  message: UIMessage;
  staticItem?: boolean;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
}

/**
 * Check if a part is a tool invocation part
 * In AI SDK, tool parts have type "tool-{toolName}" or "dynamic-tool"
 */
function isToolPart(part: { type: string }): part is ToolInvocationUIPart {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** Render a single message */
export const MessageView = ({ message, addToolApprovalResponse, staticItem }: MessageViewProps) => {
  const validPart = message.parts.filter((i) => Object.keys(i).length > 1);

  return (
    <Box flexDirection="column" width="100%" rowGap={1}>
      {validPart.map((part, index) => (
        <Box key={`${part.type}-${index}`} width="100%">
          {part.type === "text" && <TextPartView part={part as TextUIPart} role={message.role} />}
          {part.type === "reasoning" && <ThinkingPartView part={part as ReasoningUIPart} />}
          {isToolPart(part) && (
            <ToolCallPartView
              part={part as ToolInvocationUIPart}
              staticItem={staticItem}
              addToolApprovalResponse={addToolApprovalResponse}
            />
          )}
        </Box>
      ))}
    </Box>
  );
};
