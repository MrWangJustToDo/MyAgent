import { getToolName, type ToolUIPart } from "ai";
import { Box } from "ink";

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
    const content = part.input as { replacements: Array<{ oldString: string; newString: string }>; path: string };

    const id = part.toolCallId;

    return (
      <Box>
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

  return null;
};
