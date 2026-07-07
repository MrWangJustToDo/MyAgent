import { Box } from "ink";

import { EditDiff } from "../components/EditDiff";
import { useSize } from "../hooks";
import { useStreamingOutput } from "../hooks/use-streaming-output.js";
import { BG } from "../theme/colors.js";
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
  const stream = useStreamingOutput(isTask && isExecuting ? part.id : undefined, isTask && isExecuting);

  if (toolName === "task") {
    const content = toolInput as { prompt?: string; description?: string; id?: string };
    if (!content?.prompt || !content.id || !isExecuting || stream?.stdout) return null;
    return <TaskToolInputView part={part} toolInput={toolInput} />;
  }

  if (toolName === "write_file") {
    const content = toolInput as { content?: string; path?: string };
    if (!content || uiState === "input-streaming") return null;

    const approved = part.approval?.approved;
    const borderColor = typeof approved === "boolean" ? (approved ? BG.borderSuccess : BG.borderDanger) : BG.border;

    return (
      <Box paddingLeft={2}>
        <Box borderColor={borderColor} borderStyle="single">
          <EditDiff
            id={part.id}
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
    const content = toolInput as {
      path?: string;
      edits?: Array<{ oldString: string; newString: string; startLine?: number; replaceAll?: boolean }>;
    };

    if (!content || uiState === "input-streaming") return null;

    if (content.edits?.length && content.path) {
      return (
        <EditFilePreview
          toolCallId={part.id}
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
