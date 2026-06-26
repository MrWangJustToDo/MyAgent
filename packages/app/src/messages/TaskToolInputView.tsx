import { type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";
import { useTask } from "../hooks/use-task";
import { formatToolInput } from "../utils/format";

export const TaskToolInputView = ({ part }: { part: ToolUIPart }) => {
  const content = part.input as { prompt?: string; description?: string; id: string };

  const { allTools, finish, total } = useTask({ id: content.id });

  const currentTool = allTools?.at(-1);

  const toolName = currentTool ? currentTool.toolName : "";

  const toolInput = formatToolInput(currentTool?.input || {}, toolName || undefined);

  if (finish) return null;

  return (
    <Box flexDirection="row" height={1}>
      <Box flexShrink={0} flexGrow={0}>
        <Text color="gray">↳ </Text>
      </Box>
      {currentTool ? (
        <>
          <Text color="gray" italic>
            {toolName}
            {total && total > 1 ? ` (+${total}) ` : " "}
          </Text>
          <Text color="gray" italic dimColor wrap="truncate">
            {toolInput}
          </Text>
        </>
      ) : (
        <Spinner />
      )}
    </Box>
  );
};
