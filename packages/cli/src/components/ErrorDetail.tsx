import { Box, Text } from "ink";

import { useAgent } from "../hooks/use-agent";
import { useLocalChatStatus } from "../hooks/use-local-chat-status";

import type { Agent } from "@my-agent/core";

export const ErrorDetail = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const error = useAgent((s) => (s.agent as Agent)?.error || "");

  const chatError = useLocalChatStatus((s) => s.error);

  if (error || chatError) {
    return (
      <Box>
        <Text color="red">{error || chatError?.name}</Text>
      </Box>
    );
  }

  return null;
};
