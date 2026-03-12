# CLI Package Update Plan

## Overview

Update CLI package to work with the new Agent and AgentContext architecture where:
- **Agent class** has: `status`, `result`, `error` (reactive properties)
- **AgentContext** has: `runs`, `messages`, `getCurrentMessages()`, `getAllMessages()`

## Files to Update

### 1. `packages/cli/src/hooks/index.ts`

**Changes:** Update type exports to use new types from core.

```typescript
// ============================================================================
// CLI Hooks
// ============================================================================

// Re-export useAgent from core
export { useAgent, getAgentActions, type AgentState } from "@my-agent/core";

// CLI-specific hooks
export {
  useArgs,
  initArgs,
  parseArgs,
  getFlag,
  getFlagString,
  getFlagNumber,
  getFlagBoolean,
  type ParsedArgs,
  type AgentConfig,
} from "./useArgs.js";

export { useUserInput, getInputActions, type UserInputState } from "./useUserInput.js";

// Re-export types from core for convenience
export type {
  // Agent types
  AgentStatus,
  AgentRunResult,
  AgentContext,
  // Message types (new)
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  // Run types
  Run,
  RunStatus,
  // Tool types
  ToolCall,
  ToolStatus,
  TokenUsage,
  ContextData,
} from "@my-agent/core";
```

---

### 2. `packages/cli/src/components/layout/Content.tsx`

**Changes:** Rewrite to handle new Message types (UserMessage, AssistantMessage, ToolMessage).

```typescript
import { Box, Text } from "ink";

import type { Message, UserMessage, AssistantMessage, ToolMessage, ToolCall } from "@my-agent/core";

import { Spinner } from "../Spinner.js";

// ============================================================================
// Types
// ============================================================================

export interface ContentProps {
  messages: readonly Message[];
  currentAssistant: AssistantMessage | null;
  pendingApproval: ToolCall | null;
  isRunning: boolean;
}

// ============================================================================
// Message Components
// ============================================================================

const UserMessageView = ({ message }: { message: UserMessage }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="blue" bold>
      You:
    </Text>
    <Text>{message.text}</Text>
  </Box>
);

const AssistantMessageView = ({ message }: { message: AssistantMessage }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="green" bold>
      Assistant:
    </Text>
    {message.reasoning && (
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          {message.reasoning}
        </Text>
      </Box>
    )}
    {message.text && <Text>{message.text}</Text>}
    {message.toolCalls.length > 0 && (
      <Box flexDirection="column" marginTop={1}>
        {message.toolCalls.map((tc) => (
          <ToolCallView key={tc.id} toolCall={tc} />
        ))}
      </Box>
    )}
  </Box>
);

const ToolCallView = ({ toolCall }: { toolCall: ToolCall }) => {
  const statusColor =
    toolCall.status === "success"
      ? "green"
      : toolCall.status === "error" || toolCall.status === "rejected"
        ? "red"
        : toolCall.status === "running"
          ? "yellow"
          : "gray";

  return (
    <Box marginLeft={2} flexDirection="column">
      <Text>
        <Text color={statusColor}>●</Text> {toolCall.name}
        {toolCall.status === "running" && <Spinner />}
      </Text>
      {toolCall.result !== undefined && (
        <Text color="gray" dimColor>
          {JSON.stringify(toolCall.result, null, 2).slice(0, 200)}
        </Text>
      )}
      {toolCall.error && <Text color="red">{toolCall.error}</Text>}
    </Box>
  );
};

const ToolMessageView = ({ message }: { message: ToolMessage }) => (
  <Box marginLeft={2} marginBottom={1}>
    <Text color="gray">
      Tool result for {message.toolName}:{" "}
      {message.error ? (
        <Text color="red">{message.error}</Text>
      ) : (
        <Text>{JSON.stringify(message.result, null, 2).slice(0, 200)}</Text>
      )}
    </Text>
  </Box>
);

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
// Content Component
// ============================================================================

export const Content = ({ messages, currentAssistant, pendingApproval, isRunning }: ContentProps) => {
  return (
    <Box flexDirection="column" padding={1}>
      {/* Render completed messages */}
      {messages.map((msg) => (
        <MessageView key={msg.id} message={msg} />
      ))}

      {/* Render current streaming assistant message */}
      {currentAssistant && currentAssistant.status === "streaming" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green" bold>
            Assistant:
          </Text>
          {currentAssistant.reasoning && (
            <Box marginLeft={2}>
              <Text color="gray" dimColor>
                {currentAssistant.reasoning}
              </Text>
            </Box>
          )}
          {currentAssistant.text && <Text>{currentAssistant.text}</Text>}
          {currentAssistant.toolCalls.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {currentAssistant.toolCalls.map((tc) => (
                <ToolCallView key={tc.id} toolCall={tc} />
              ))}
            </Box>
          )}
          {isRunning && <Spinner />}
        </Box>
      )}

      {/* Pending approval prompt */}
      {pendingApproval && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow">
            Tool "{pendingApproval.name}" requires approval. Press Enter to approve, Escape to reject.
          </Text>
        </Box>
      )}
    </Box>
  );
};
```

---

### 3. `packages/cli/src/components/Agent.tsx`

**Changes:** Update state access to use Agent class properties instead of useAgent hook state.

Key changes:
1. Access agent from `useAgent((s) => s.current)`
2. Read `status`, `result`, `error` from agent instance
3. Use new context methods: `getAllMessages()`, `getCurrentAssistant()`, `getPendingApproval()`

```typescript
// OLD pattern:
const status = useAgent((s) => s.status);
const error = useAgent((s) => s.error);
const result = useAgent((s) => s.result);
const context = useAgent((s) => s.current?.context ?? null);
const messages = context?.getMessages() ?? [];

// NEW pattern:
const agent = useAgent((s) => s.current);
const status = agent?.status ?? "idle";
const result = agent?.result ?? null;
const error = agent?.error ?? "";
const context = agent?.context ?? null;

// New context method calls
const messages = context?.getAllMessages() ?? [];
const currentAssistant = context?.getCurrentAssistant() ?? null;
const pendingApproval = context?.getPendingApproval() ?? null;
const currentRun = context?.getCurrentRun();
const usage = currentRun?.usage ?? context?.getTotalUsage() ?? null;
```

Update Content component props:
```typescript
<Content
  messages={messages}
  currentAssistant={currentAssistant}
  pendingApproval={pendingApproval}
  isRunning={status === "running"}
/>
```

---

### 4. `packages/cli/src/components/layout/Footer.tsx`

**Changes:** Remove step display, simplify to just status and usage.

```typescript
import { Box, Text } from "ink";

import type { AgentStatus, TokenUsage } from "../../hooks/index.js";

export interface FooterProps {
  status: AgentStatus;
  usage: TokenUsage | null;
  error: string;
}

const StatusIndicator = ({ status }: { status: AgentStatus }) => {
  const statusConfig: Record<AgentStatus, { color: string; text: string }> = {
    idle: { color: "gray", text: "Ready" },
    initializing: { color: "yellow", text: "Initializing..." },
    running: { color: "green", text: "Running..." },
    waiting_approval: { color: "yellow", text: "Waiting for approval" },
    completed: { color: "green", text: "Completed" },
    error: { color: "red", text: "Error" },
  };

  const config = statusConfig[status];
  return <Text color={config.color}>{config.text}</Text>;
};

export const Footer = ({ status, usage, error }: FooterProps) => {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <StatusIndicator status={status} />

      {usage && (
        <Text color="gray">
          Tokens: {usage.inputTokens} in / {usage.outputTokens} out
        </Text>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
};
```

---

## Execution Order

1. Update `hooks/index.ts` - type exports
2. Update `layout/Content.tsx` - new message rendering
3. Update `Agent.tsx` - state access pattern
4. Update `layout/Footer.tsx` - simplify (remove steps)
5. Run `pnpm lint --fix && pnpm build` to verify

## Notes

- The step count display is removed from Footer per user request
- All message rendering now uses the new union type `Message = UserMessage | AssistantMessage | ToolMessage`
- Tool calls are embedded in `AssistantMessage.toolCalls[]` instead of separate `ToolContent` in a `contents[]` array
