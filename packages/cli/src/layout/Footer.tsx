import { Box, Text } from "ink";
import Divider from "ink-divider";

import { ErrorDetail } from "../components/ErrorDetail.js";
import { FullBox } from "../components/FullBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { Spinner } from "../components/Spinner.js";
import { TodoList } from "../components/TodoList.js";
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
      <FullBox gap={2} width="full">
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

        {/* Usage stats */}
        <LLMUsage />

        <TodoStats />
      </FullBox>

      {/* Error message */}
      <ErrorDetail />

      {/* Todo list */}
      <TodoList />

      <Box height={1} />

      {/* Input */}
      <FullBox opaque>
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
      </FullBox>
      <Divider />
    </FullBox>
  );
};
