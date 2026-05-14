import { getToolName, type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { EditDiff } from "../components/EditDiff";
import { SplitNode } from "../components/SplitNode";
import { useSize } from "../hooks";

import { TaskToolInputView } from "./TaskToolInputView";

export const ToolInputView = ({ part }: { part: ToolUIPart }) => {
  const toolName = getToolName(part);

  const width = useSize((s) => s.state.screenWidth);

  // Show task/subagent prompt
  if (toolName === "task") {
    const content = part.input as { prompt?: string; description?: string };

    if (!content?.prompt) return null;

    return <TaskToolInputView part={part} />;
  }

  if (toolName === "write_file") {
    const content = part.input as { content?: string; path?: string };

    if (!content) return null;

    if (part.state === "input-streaming") return null;

    const id = part.toolCallId;

    return (
      <EditDiff
        id={id}
        width={width - 6}
        oldPath=""
        oldFile=""
        newPath={content.path || ""}
        newFile={content.content || ""}
      />
    );
  }

  if (toolName === "edit_file") {
    const content = part.input as { oldString?: string; path?: string; newString?: string };

    if (!content) return null;

    if (part.state === "input-streaming") return null;

    const id = part.toolCallId;

    return (
      <EditDiff
        id={id}
        width={width - 6}
        oldPath={content.path || ""}
        oldFile={content.oldString || ""}
        newPath={content.path || ""}
        newFile={content.newString || ""}
      />
    );
  }

  if (toolName === "search_replace") {
    if (part.state === "input-streaming") return null;

    const content = part.input as { replacements: Array<{ oldString: string; newString: string }>; path: string };

    const id = part.toolCallId;

    return (
      <Box flexDirection="column">
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
              width={width - 6}
              id={id + "-" + index}
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

  // Show run_command input: display the full command text in terminal style
  if (toolName === "run_command") {
    if (part.state === "input-streaming") return null;

    const content = part.input as {
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      background?: boolean;
    };

    if (!content?.command) return null;

    return (
      <Box flexDirection="column" paddingLeft={1}>
        {/* Show the command with a terminal prompt */}
        <Box>
          <Text color="green">$ </Text>
          <Text>{content.command}</Text>
        </Box>
        {/* Show cwd if present */}
        {content.cwd && (
          <Box paddingLeft={2}>
            <Text color="gray" dimColor>
              cwd: {content.cwd}
            </Text>
          </Box>
        )}
        {/* Show timeout if present */}
        {content.timeout && (
          <Box paddingLeft={2}>
            <Text color="gray" dimColor>
              timeout: {content.timeout}ms
            </Text>
          </Box>
        )}
        {/* Show background flag if true */}
        {content.background && (
          <Box paddingLeft={2}>
            <Text color="gray" dimColor>
              background: true
            </Text>
          </Box>
        )}
        {/* Show env vars if present */}
        {content.env && Object.keys(content.env).length > 0 && (
          <Box paddingLeft={2}>
            <Text color="gray" dimColor>
              env: {JSON.stringify(content.env)}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  return null;
};
