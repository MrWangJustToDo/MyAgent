import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";
import { useTask } from "../hooks/use-task";
import { COLORS } from "../theme/colors.js";
import { formatToolInput } from "../utils/format";

import type { ToolCallPart } from "@tanstack/ai";

export const TaskToolInputView = ({ toolInput }: { part: ToolCallPart; toolInput: unknown }) => {
  const content = toolInput as { prompt?: string; description?: string; id: string };

  const { allTools, total, agent } = useTask({ id: content.id });

  const currentTool = allTools?.at(-1);
  const toolName = currentTool ? currentTool.toolName : "";
  const currentInput = formatToolInput(currentTool?.input || {}, toolName || undefined);

  if (!agent) {
    return (
      <Box flexDirection="row" height={1} paddingLeft={2}>
        <Spinner />
      </Box>
    );
  }

  return (
    <Box flexDirection="row" height={1} paddingLeft={2}>
      <Box flexShrink={0} flexGrow={0}>
        <Text color={COLORS.muted}>↳ </Text>
      </Box>
      {currentTool ? (
        <>
          <Text color={COLORS.muted} italic>
            {toolName}
            {total && total > 1 ? ` (+${total}) ` : " "}
          </Text>
          <Text color={COLORS.muted} italic dimColor wrap="truncate">
            {currentInput}
          </Text>
        </>
      ) : (
        <Spinner />
      )}
    </Box>
  );
};
