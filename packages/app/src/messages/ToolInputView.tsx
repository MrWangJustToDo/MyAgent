import { Box } from "ink";

import { MessageDiffView } from "../components/MessageDiffView.js";
import { useSize } from "../hooks";
import { useTask } from "../hooks/use-task.js";
import { approvalFrameColor } from "../utils/diff-frame.js";
import { isToolExecuting } from "../utils/tool-part.js";

import { EditFilePreview } from "./EditFilePreview";
import { TaskToolInputView } from "./TaskToolInputView";

import type { UiToolState } from "../utils/tool-part.js";
import type { ToolCallPart } from "@tanstack/ai";

export const ToolInputView = ({
  part,
  toolInput,
  uiState,
}: {
  part: ToolCallPart;
  toolInput: unknown;
  uiState: UiToolState;
}) => {
  const toolName = part.name;
  const width = useSize((s) => s.state.screenWidth);
  const bodyWidth = width - 8;
  const isExecuting = isToolExecuting(part);
  const isTask = toolName === "task";
  const taskInput = toolInput as { prompt?: string; description?: string; id?: string };
  const { phase: taskPhase } = useTask({ id: isTask && taskInput?.id ? taskInput.id : "", taskId: part.id });

  if (toolName === "task") {
    if (!taskInput?.prompt || !taskInput.id || !isExecuting || taskPhase === "summary") return null;
    return <TaskToolInputView part={part} toolInput={toolInput} />;
  }

  if (toolName === "write_file") {
    const content = toolInput as { content?: string; path?: string };
    if (!content || uiState === "input-streaming") return null;

    return (
      <Box paddingLeft={2}>
        <MessageDiffView
          diffId={part.id}
          width={bodyWidth}
          oldPath=""
          oldFile=""
          newPath={content.path || ""}
          newFile={content.content || ""}
          frameColor={approvalFrameColor(part.approval?.approved)}
        />
      </Box>
    );
  }

  if (toolName === "edit_file") {
    const content = toolInput as {
      path?: string;
      edits?: Array<{ oldString: string; newString: string; startLine?: number; replaceAll?: boolean }>;
    };

    if (!content || uiState === "input-streaming") return null;

    if (content.edits?.length && content.path) {
      return (
        <EditFilePreview
          toolCallId={part.id}
          approvalId={part.approval?.id}
          path={content.path}
          edits={content.edits}
          approved={part.approval?.approved}
          bodyWidth={bodyWidth}
          output={
            uiState === "output-available"
              ? (part.output as { oldFile?: string; newFile?: string } | undefined)
              : undefined
          }
        />
      );
    }

    return null;
  }

  return null;
};
