import { type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";
import { useSubAgents } from "../hooks/use-sub-agents";
import { formatToolInput } from "../utils/format";

export const TaskToolInputView = ({ part }: { part: ToolUIPart }) => {
  const content = part.input as { prompt?: string; description?: string; id: string };

  const useSubagent = useSubAgents({ subId: content.id });

  const {
    allTools,
    length: total,
    finish,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
  } = useSubagent.useDeepStableSelector((s) => ({
    allTools: s.state?.getTools(),
    finish: !s.state || !!s.state.finishInfo,
    length: s.state?.getTools().length || 0,
  }));

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
            {total > 1 ? ` (+${total}) ` : " "}
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
