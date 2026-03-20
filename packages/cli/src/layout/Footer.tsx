import { Box, Text } from "ink";
import Divider from "ink-divider";

import { ErrorDetail } from "../components/ErrorDetail.js";
import { FullBox } from "../components/FullBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { Spinner } from "../components/Spinner.js";
import { TodoStats } from "../components/TodoStats.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent } from "../hooks/use-agent.js";

import type { Agent } from "@my-agent/core";

export const Footer = () => {
  const status = useAgent((s) => (s.agent as Agent)?.status || "idle");

  const isInputEnabled = status === "idle" || status === "completed" || status === "error";

  return (
    <FullBox flexDirection="column" flexGrow={0} paddingY={1}>
      <Divider />
      {/* Status bar */}
      <Box gap={2} width="full">
        {/* Status indicator */}
        <Box>
          {status === "running" && <Spinner text="Running..." />}
          {status === "completed" && <Text color="green">Completed</Text>}
          {status === "waiting" && (
            <Text color="yellow" bold>
              Waiting for approval
            </Text>
          )}
          {status === "idle" && (
            <Text color="gray" dimColor>
              Ready
            </Text>
          )}
          {status === "error" && <Text color="red">Error</Text>}
        </Box>
        <TodoStats />
      </Box>

      {/* Error message */}
      <ErrorDetail />

      <Box height={1} />

      {/* Input */}
      <Box opaque>
        <Text color={isInputEnabled ? "green" : "gray"} bold>
          {">"}{" "}
        </Text>
        {isInputEnabled ? (
          <UserInput />
        ) : (
          <Text color="gray" dimColor>
            Processing...
          </Text>
        )}
      </Box>
      <Divider />
      <Box gap={2} justifyContent="space-between">
        <Box>
          <Text color="gray" dimColor>
            Exit: Ctrl + C
          </Text>
        </Box>
        <LLMUsage />
      </Box>
    </FullBox>
  );
};
