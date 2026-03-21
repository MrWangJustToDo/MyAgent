import { Box, Text } from "ink";

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
    <FullBox flexDirection="column" flexGrow={1} flexShrink={0} paddingY={1}>
      {/* Status bar */}
      <Box
        gap={2}
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderTop
        borderTopColor="gray"
        borderStyle="single"
        borderTopDimColor
        width="full"
      >
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

      <Box height={1} flexGrow={1} flexShrink={0} />

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
      <Box height={1} flexGrow={1} flexShrink={0} />
      <Box
        gap={2}
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderTopColor="gray"
        borderStyle="single"
        borderTopDimColor
        justifyContent="space-between"
      >
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
