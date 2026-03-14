import { Box, Text } from "ink";
import Divider from "ink-divider";

import { Spinner } from "../components/Spinner.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent } from "../hooks/useAgent.js";
import { useAgentContext } from "../hooks/useAgentContext.js";
import { useSize } from "../hooks/useSize.js";

import type { TokenUsage } from "@my-agent/core";

export const Footer = () => {
  const { status, error } = useAgent((s) => ({
    status: s.agent?.status || "idle",
    error: s.agent?.error || "",
  }));

  const usage = useAgentContext((s) => s.context?.usage) as TokenUsage | undefined;

  const isInputEnabled = status === "idle" || status === "completed" || status === "error";

  return (
    <Box flexDirection="column" flexGrow={0} ref={useSize.getActions().setFooter} paddingY={1}>
      <Divider />
      {/* Status bar */}
      <Box gap={2} width="full">
        {/* Status indicator */}
        <Box>
          {status === "running" && <Spinner text="Running..." />}
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
