import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent, useAgentContext } from "../hooks";
import { useHeight } from "../hooks/useHeight.js";

export const Footer = () => {
  const { status, error } = useAgent((s) => ({
    status: s.current?.status || "idle",
    error: s.current?.error || "",
  }));

  const usage = useAgentContext.useDeepStableSelector((s) => s.context?.getTotalUsage?.());

  const isInputEnabled = status === "idle" || status === "completed" || status === "error";

  return (
    <Box flexDirection="column" ref={useHeight.getActions().setFooter} marginBottom={1}>
      {/* Separator */}
      <Box>
        <Text color="gray" dimColor>
          {"─".repeat(60)}
        </Text>
      </Box>

      {/* Status bar */}
      <Box gap={2}>
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
            <Text color="gray" dimColor>
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

      {/* Input */}
      <Box>
        <Text color={isInputEnabled ? "green" : "gray"} bold>
          {">"}{" "}
        </Text>
        {isInputEnabled ? (
          <UserInput />
        ) : (
          <Text color="gray" dimColor>
            {status === "waiting_approval" ? "Press Y to approve, N to deny" : "Processing..."}
          </Text>
        )}
      </Box>
    </Box>
  );
};
