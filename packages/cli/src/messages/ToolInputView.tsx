import { getToolName, type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { EditDiff } from "../components/EditDiff";
import { SplitNode } from "../components/SplitNode";
import { useSize } from "../hooks";

import { useStaticContext } from "./StaticContext";
import { TaskToolInputView } from "./TaskToolInputView";

export const ToolInputView = ({ part }: { part: ToolUIPart }) => {
  const toolName = getToolName(part);
  const width = useSize((s) => s.state.screenWidth);
  const bodyWidth = width - 4;

  if (toolName === "task") {
    const content = part.input as { prompt?: string; description?: string };
    if (!content?.prompt) return null;
    return <TaskToolInputView part={part} />;
  }

  if (toolName === "write_file") {
    const content = part.input as { content?: string; path?: string };
    if (!content || part.state === "input-streaming") return null;

    return (
      <Box paddingLeft={2}>
        <EditDiff
          id={part.toolCallId}
          width={bodyWidth}
          oldPath=""
          oldFile=""
          newPath={content.path || ""}
          newFile={content.content || ""}
        />
      </Box>
    );
  }

  if (toolName === "edit_file") {
    const content = part.input as { oldString?: string; path?: string; newString?: string };
    if (!content || part.state === "input-streaming") return null;

    return (
      <Box paddingLeft={2}>
        <EditDiff
          id={part.toolCallId}
          width={bodyWidth}
          oldPath={content.path || ""}
          oldFile={content.oldString || ""}
          newPath={content.path || ""}
          newFile={content.newString || ""}
        />
      </Box>
    );
  }

  if (toolName === "search_replace") {
    if (part.state === "input-streaming") return null;

    const content = part.input as { replacements: Array<{ oldString: string; newString: string }>; path: string };

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <SplitNode
          split={
            <Box
              borderTop
              borderLeft={false}
              borderRight={false}
              borderBottom={false}
              borderTopColor="gray"
              borderStyle="single"
              borderTopDimColor
            />
          }
        >
          {content?.replacements?.map((item, index) => (
            <EditDiff
              width={bodyWidth}
              id={part.toolCallId + "-" + index}
              oldPath={content.path || ""}
              oldFile={item.oldString || ""}
              newPath={content.path || ""}
              newFile={item.newString || ""}
            />
          ))}
        </SplitNode>
      </Box>
    );
  }

  if (toolName === "run_command") {
    if (part.state === "input-streaming") return null;

    const content = part.input as {
      command: string;
      cwd?: string;
      timeout?: number;
      background?: boolean;
    };

    if (!content?.command) return null;

    const { staticMessage } = useStaticContext();

    if (staticMessage) return null;

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Box>
          <Box flexShrink={0}>
            <Text color="green">$ </Text>
          </Box>
          <Text dimColor>
            {content.command}
            {content.cwd && (
              <Text color="gray" dimColor>
                cwd: {content.cwd}
              </Text>
            )}
            {content.timeout && (
              <Text color="gray" dimColor>
                timeout: {content.timeout}ms
              </Text>
            )}
            {content.background && (
              <Text color="gray" dimColor>
                background: true
              </Text>
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
};
