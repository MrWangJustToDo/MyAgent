import { Box } from "ink";
import { useMemo } from "react";

import { Spinner } from "../components/Spinner.js";
import { useSubagentMessages } from "../hooks/use-subagent-messages.js";
import { getMessages } from "../utils/get-messages.js";

import { MessageView } from "./MessageView.js";

export interface SubagentPreviewViewProps {
  subagentId: string;
}

/**
 * Read-only subagent transcript for the task panel (full MessageView rendering).
 */
export const SubagentPreviewView = ({ subagentId }: SubagentPreviewViewProps) => {
  const messages = useSubagentMessages(subagentId);
  const { staticMessages, dynamicMessages } = useMemo(() => getMessages(messages), [messages]);
  const previewMessages = useMemo(() => [...staticMessages, ...dynamicMessages], [staticMessages, dynamicMessages]);

  if (previewMessages.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Spinner />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {previewMessages.map((message) => (
        <MessageView key={message.id} message={message} readOnly />
      ))}
    </Box>
  );
};
