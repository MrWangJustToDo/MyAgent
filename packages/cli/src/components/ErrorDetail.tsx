import { Box, Text } from "ink";

import { useAgent } from "../hooks/use-agent";

import type { Agent } from "@my-agent/core";

export const ErrorDetail = () => {
  const error = useAgent((s) => (s.agent as Agent)?.error || "");

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return null;
};
