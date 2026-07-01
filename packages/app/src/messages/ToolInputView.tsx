import { getToolName, type ToolUIPart } from "ai";
import { Box } from "ink";

import { EditDiff } from "../components/EditDiff";
import { useSize } from "../hooks";
import { BG } from "../theme/colors.js";

import { EditFilePreview } from "./EditFilePreview";
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

    const approved = part.approval?.approved;

    const borderColor = typeof approved === "boolean" ? (approved ? BG.borderSuccess : BG.borderDanger) : BG.border;

    return (
      <Box paddingLeft={2}>
        <Box borderColor={borderColor} borderStyle="single">
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
    const content = part.input as {
      path?: string;
      edits?: Array<{ oldString: string; newString: string; startLine?: number; replaceAll?: boolean }>;
    };

    if (!content || part.state === "input-streaming") return null;

    // Unified edit mode: edits array (single edit = array with one element)
    if (content.edits?.length && content.path) {
      return (
        <EditFilePreview
          toolCallId={part.toolCallId}
          path={content.path}
          edits={content.edits}
          approved={part.approval?.approved}
          bodyWidth={bodyWidth}
          output={
            part.state === "output-available"
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
