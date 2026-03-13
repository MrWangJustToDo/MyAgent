import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner.js";
import { useAgentContext } from "../hooks";
import { useSize } from "../hooks/useSize.js";
import { Markdown } from "../markdown";

import type { Message, UserMessage, AssistantMessage, ToolMessage, ToolCall } from "@my-agent/core";

// ============================================================================
// Helper Components
// ============================================================================

/** Render user message */
const UserMessageView = ({ message }: { message: UserMessage }) => (
  <TitledBox titles={["You:"]} borderStyle="round">
    <Box paddingLeft={2}>
      <Text>{message.text}</Text>
    </Box>
  </TitledBox>
);

/** Render tool call within assistant message */
const ToolCallView = ({ toolCall }: { toolCall: ToolCall }) => {
  const statusIcon = () => {
    switch (toolCall.status) {
      case "pending":
      case "running":
        return <Spinner text="" />;
      case "success":
        return <Text color="green">✓</Text>;
      case "error":
        return <Text color="red">✗</Text>;
      case "rejected":
        return <Text color="yellow">⊘</Text>;
      case "need-approve":
        return <Text color="yellow">?</Text>;
      default:
        return null;
    }
  };

  const statusColor = () => {
    switch (toolCall.status) {
      case "pending":
      case "running":
        return "yellow";
      case "success":
        return "green";
      case "error":
        return "red";
      case "rejected":
        return "yellow";
      case "need-approve":
        return "yellow";
      default:
        return "gray";
    }
  };

  return (
    <TitledBox titles={["ToolCall"]} borderStyle="round">
      {statusIcon()}
      <Text color={statusColor()}> {toolCall.name}</Text>
      <Text color="gray" dimColor>
        {" "}
        {formatToolArgs(toolCall.args)}
      </Text>
    </TitledBox>
  );
};

/** Render assistant message */
const AssistantMessageView = ({ message }: { message: AssistantMessage }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="cyan" bold>
      Agent:
    </Text>

    {/* Reasoning (if any) */}
    {message.reasoning && (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="magenta" dimColor italic>
          Thinking:
        </Text>
        <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text color="gray" dimColor wrap="wrap">
            {message.reasoning}
          </Text>
        </Box>
      </Box>
    )}

    {/* Tool calls (if any) */}
    {message.toolCalls.length > 0 && (
      <Box flexDirection="column" marginBottom={1}>
        {message.toolCalls.map((tc) => (
          <Box key={tc.id}>
            <ToolCallView toolCall={tc} />
          </Box>
        ))}
      </Box>
    )}

    {/* Text content */}
    {message.text && (
      <Box paddingLeft={2}>
        <Markdown content={message.text + (message.status === "streaming" ? "▌" : "")} />
      </Box>
    )}
  </Box>
);

/** Render tool result message */
const ToolMessageView = ({ message }: { message: ToolMessage }) => (
  <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
    <Text color="gray" dimColor>
      Tool result ({message.toolName}):
    </Text>
    <Box paddingLeft={2}>
      {message.error ? (
        <Text color="red">{message.error}</Text>
      ) : (
        <Text color="gray" dimColor>
          {formatResult(message.result)}
        </Text>
      )}
    </Box>
  </Box>
);

/** Render any message by type */
const MessageView = ({ message }: { message: Message }) => {
  switch (message.type) {
    case "user":
      return <UserMessageView message={message} />;
    case "assistant":
      return <AssistantMessageView message={message} />;
    case "tool":
      return <ToolMessageView message={message} />;
    default:
      return null;
  }
};

// ============================================================================
// Main Component
// ============================================================================

export const Content = () => {
  const height = useSize((s) => s.state.content);

  const { messages, current } = useAgentContext.useDeepStableSelector((s) => ({
    messages: s.context?.getAllMessages() || [],
    current: s.context?.getCurrentAssistant() || null,
  }));

  return (
    <Box flexDirection="column" minHeight={height - 1}>
      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column">
          <MessageView message={msg} />
        </Box>
      ))}
      {current && (
        <Box>
          <MessageView message={current} />
        </Box>
      )}
    </Box>
  );
};

// ============================================================================
// Helpers
// ============================================================================

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

/**
 * Format tool result for display
 */
function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "null";
  const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}
