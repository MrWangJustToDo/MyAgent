import { getToolName, type ToolUIPart } from "ai";
import { Box } from "ink";

import { EditDiff } from "../components/EditDiff";
import { SplitNode } from "../components/SplitNode";
import { useSize } from "../hooks";

import { TaskToolInputView } from "./TaskToolInputView";

export const ToolInputView = ({ part }: { part: ToolUIPart }) => {
  const toolName = getToolName(part);
  const width = useSize((s) => s.state.screenWidth);
  const bodyWidth = width - 8;

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
        <Box borderColor="#555555" borderStyle="single">
          <EditDiff
            id={part.toolCallId}
            width={bodyWidth}
            oldPath=""
            oldFile=""
            newPath={content.path || ""}
            newFile={content.content || ""}
          />
        </Box>
      </Box>
    );
  }

  if (toolName === "edit_file") {
    const content = part.input as { oldString?: string; path?: string; newString?: string; startLine?: number };
    if (!content || !content.oldString || !content.newString || part.state === "input-streaming") return null;

    return (
      <Box paddingLeft={2}>
        <Box borderColor="#555555" borderStyle="single">
          <EditDiff
            id={part.toolCallId}
            width={bodyWidth}
            oldPath={content.path || ""}
            oldFile={content.oldString || ""}
            newPath={content.path || ""}
            newFile={content.newString || ""}
            startLine={content.startLine}
          />
        </Box>
      </Box>
    );
  }

  if (toolName === "search_replace") {
    if (part.state === "input-streaming") return null;

    const content = part.input as {
      replacements: Array<{ oldString: string; newString: string; startLine?: number }>;
      path: string;
    };

    if (!content?.replacements?.length || !content.path) return null;

    return (
      <Box paddingLeft={2}>
        <Box flexDirection="column" borderColor="#555555" borderStyle="single">
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
                startLine={item.startLine}
              />
            ))}
          </SplitNode>
        </Box>
      </Box>
    );
  }

  return null;
};
