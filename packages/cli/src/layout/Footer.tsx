import { Box, Text } from "ink";

import { AttachmentList } from "../components/AttachmentList.js";
import { AutocompleteList } from "../components/AutocompleteList.js";
import { ErrorDetail } from "../components/ErrorDetail.js";
import { FullBox } from "../components/FullBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { Spinner } from "../components/Spinner.js";
import { TodoStats } from "../components/TodoStats.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent } from "../hooks/use-agent.js";

import type { AgentStatus } from "@my-agent/core";

export const Footer = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const _status = useAgent((s) => s.agent?.status || "idle");

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const allMcp = useAgent((s) => s.agent?.mcpManager?.getConnectedServers());

  const status = _status as AgentStatus;

  const isInputEnabled = status === "idle" || status === "completed" || status === "error" || status === "aborted";

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
          {status === "compacting" && <Spinner text="Compacting..." />}
          {status === "completed" && <Text color="green">Completed</Text>}
          {status === "aborted" && (
            <Text color="green" dimColor>
              Aborted
            </Text>
          )}
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

      {/* Attachments */}
      {isInputEnabled && <AttachmentList />}

      {/* Autocomplete suggestions */}
      {isInputEnabled && <AutocompleteList />}

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
        <Box gap={2}>
          <Text color="gray" dimColor>
            Exit: Ctrl + C
          </Text>
          {status === "running" && (
            <Text color="yellow" dimColor>
              Abort: Esc
            </Text>
          )}
        </Box>
        {allMcp && allMcp.length > 0 && (
          <Box>
            <Text color="blue" dimColor>
              MCP: {allMcp.length}
            </Text>
          </Box>
        )}
        <LLMUsage />
      </Box>
    </FullBox>
  );
};
