import { Box, Text } from "ink";

import { useHeight } from "../../hooks/useHeight";
import { Markdown } from "../../markdown";
import { Spinner } from "../Spinner.js";

import type { ToolCallInfo } from "@my-agent/core";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ToolApprovalInfo {
  toolCall: ToolCallInfo;
}

export interface ContentProps {
  /** Chat history */
  messages: readonly Message[];
  /** Current streaming response */
  currentResponse?: string;
  /** Current streaming reasoning */
  currentReasoning?: string;
  /** Active tool calls (in progress) */
  activeToolCalls: readonly ToolCallInfo[];
  /** Completed tool calls (current step) */
  completedToolCalls: readonly ToolCallInfo[];
  /** Pending approval */
  pendingApproval?: ToolApprovalInfo;
  /** Whether agent is running */
  isRunning: boolean;
}

export const Content = ({
  messages,
  currentResponse,
  currentReasoning,
  activeToolCalls,
  completedToolCalls,
  pendingApproval,
  isRunning,
}: ContentProps) => {
  const height = useHeight.useShallowStableSelector((s) => s.state.content);

  return (
    <Box overflowY="hidden" height={height}>
      <Box flexDirection="column" flexGrow={1}>
        {/* Chat History */}
        {messages.map((msg, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text color={msg.role === "user" ? "green" : "cyan"} bold>
              {msg.role === "user" ? "You" : "Agent"}:
            </Text>
            <Box paddingLeft={2}>
              {msg.role === "assistant" ? <Markdown content={msg.content} /> : <Text wrap="wrap">{msg.content}</Text>}
            </Box>
          </Box>
        ))}

        {/* Active Tool Calls */}
        {isRunning && activeToolCalls.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {activeToolCalls.map((tc) => (
              <Box key={tc.toolCallId}>
                <Spinner text="" />
                <Text color="yellow"> {tc.toolName}</Text>
                <Text color="gray" dimColor>
                  {" "}
                  {formatToolArgs(tc.args)}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Completed Tool Calls (current step) */}
        {isRunning && completedToolCalls.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {completedToolCalls.map((tc) => (
              <Box key={tc.toolCallId}>
                <Text color="green">✓</Text>
                <Text color="gray"> {tc.toolName}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Streaming Reasoning */}
        {isRunning && currentReasoning && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="magenta" dimColor italic>
              Thinking:
            </Text>
            <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
              <Text color="gray" dimColor wrap="wrap">
                {currentReasoning}
              </Text>
            </Box>
          </Box>
        )}

        {/* Streaming Response */}
        {isRunning && currentResponse && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="cyan" bold>
              Agent:
            </Text>
            <Box paddingLeft={2}>
              <Markdown content={currentResponse + "▌"} />
            </Box>
          </Box>
        )}

        {/* Tool Approval Dialog */}
        {pendingApproval && (
          <Box flexDirection="column" marginBottom={1} borderStyle="double" borderColor="yellow" padding={1}>
            <Text color="yellow" bold>
              Tool Approval Required
            </Text>
            <Box marginTop={1}>
              <Text>
                Tool: <Text color="cyan">{pendingApproval.toolCall.toolName}</Text>
              </Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text color="gray">Arguments:</Text>
              <Box paddingLeft={2}>
                <Text wrap="wrap">{JSON.stringify(pendingApproval.toolCall.args, null, 2)}</Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Text>
                Press{" "}
                <Text color="green" bold>
                  Y
                </Text>{" "}
                to approve or{" "}
                <Text color="red" bold>
                  N
                </Text>{" "}
                to deny
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

/**
 * Format tool arguments for display
 */
function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";

  const formatted = entries
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 30 ? strValue.slice(0, 30) + "..." : strValue;
      return `${key}=${truncated}`;
    })
    .join(", ");

  return entries.length > 2 ? `(${formatted}, ...)` : `(${formatted})`;
}
