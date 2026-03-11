import { Box, Text } from "ink";

import { useHeight } from "../../hooks/useHeight.js";
import { Spinner } from "../Spinner.js";
import { UserInput } from "../UserInput.js";

export interface FooterProps {
  /** Current status */
  status: "idle" | "initializing" | "running" | "waiting_approval" | "completed" | "error";
  /** Usage stats */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Current step number */
  currentStep?: number;
  /** Total steps completed */
  totalSteps?: number;
  /** Error message if any */
  error?: string;
}

export const Footer = ({ status, usage, currentStep, totalSteps, error }: FooterProps) => {
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
          {status === "running" && <Spinner text={`Step ${currentStep || 1}...`} />}
          {status === "waiting_approval" && (
            <Text color="yellow" bold>
              Waiting for approval
            </Text>
          )}
          {status === "completed" && totalSteps !== undefined && (
            <Text color="green">
              Completed in {totalSteps} step{totalSteps > 1 ? "s" : ""}
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
