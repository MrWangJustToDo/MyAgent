import { Box, Text } from "ink";
import Divider from "ink-divider";

import { Spinner } from "../components/Spinner.js";
import { UserApprove } from "../components/UserApprove.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent, useAgentContext } from "../hooks";
import { useSize } from "../hooks/useSize.js";

import type { TokenUsage } from "../hooks";

export const Footer = () => {
  const { status, error } = useAgent((s) => ({
    status: s.current?.status || "idle",
    error: s.current?.error || "",
  }));

  const usage = useAgentContext((s) => s.context?.getTotalUsage() || {}) as TokenUsage;

  const isInputEnabled = status === "idle" || status === "completed" || status === "error";

  return (
    <Box flexDirection="column" flexGrow={0} ref={useSize.getActions().setFooter} paddingY={1}>
      <Divider />
      {/* Status bar */}
      <Box gap={2} width="full">
        {/* Status indicator */}
        <Box>
          {status === "initializing" && <Spinner text="Initializing..." />}
          {status === "running" && <Spinner text="Running..." />}
          {status === "waiting_approval" && (
            <Text color="yellow" bold>
              Waiting for approval
            </Text>
          )}
          {status === "completed" && <Text color="green">Completed</Text>}
          {status === "idle" && (
            <Text color="gray" dimColor>
              Ready
            </Text>
          )}
          {status === "error" && <Text color="red">Error</Text>}
        </Box>

        {/* Usage stats */}
        {usage && (
          <Box>
            <Text color="gray" dimColor wrap="truncate">
              Tokens: {usage.inputTokens} in / {usage.outputTokens} out
            </Text>
          </Box>
        )}
      </Box>

      {/* Error message */}
      {error && (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box height={1} />

      {/* Input */}
      <Box opaque>
        <Text color={isInputEnabled ? "green" : "gray"} bold>
          {">"}{" "}
        </Text>
        {isInputEnabled ? (
          <UserInput />
        ) : status === "waiting_approval" ? (
          <UserApprove />
        ) : (
          <Text color="gray" dimColor>
            Processing...
          </Text>
        )}
      </Box>
      <Divider />
    </Box>
  );
};
