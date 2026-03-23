import { DiffView, DiffModeEnum } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { getToolName, type ToolUIPart } from "ai";
// import { Box, Text } from "ink";
import { memo } from "react";

import { useSize } from "../hooks";
import { useDiffFileCache } from "../hooks/use-diff-file-cache";

import { TaskToolInputView } from "./TaskToolInputView";

const { getDiffFile, setDiffFile } = useDiffFileCache.getActions();

export const ToolInputView = memo(
  ({ part }: { part: ToolUIPart }) => {
    const toolName = getToolName(part);

    const width = useSize((s) => s.state.screenWidth);

    // Show task/subagent prompt
    if (toolName === "task") {
      const content = part.input as { prompt?: string; description?: string };

      if (!content?.prompt) return null;

      return <TaskToolInputView part={part} />;

      // return (
      //   <Box marginTop={1} flexDirection="column">
      //     <Text color="cyan" dimColor>
      //       {content.prompt}
      //     </Text>
      //   </Box>
      // );
    }

    if (toolName === "write_file") {
      const content = part.input as { content?: string; path?: string };

      if (!content) return null;

      const id = part.toolCallId;

      const diffFile = getDiffFile(id) || generateDiffFile("", "", content.path || "", content.content || "", "", "");

      setDiffFile(id, diffFile);

      diffFile.initTheme("dark");

      diffFile.init();

      return (
        <DiffView
          width={width - 6}
          diffViewMode={DiffModeEnum.Unified}
          diffFile={diffFile}
          diffViewHideOperator
          diffViewHighlight
          diffViewTheme="dark"
        />
      );
    }

    if (toolName === "edit_file") {
      const content = part.input as { oldString?: string; path?: string; newString?: string };

      if (!content) return null;

      const id = part.toolCallId;

      const diffFile =
        getDiffFile(id) ||
        generateDiffFile(
          content.path || "",
          content.oldString || "",
          content.path || "",
          content.newString || "",
          "",
          ""
        );

      setDiffFile(id, diffFile);

      diffFile.initTheme("dark");

      diffFile.init();

      return (
        <DiffView
          width={width - 6}
          diffViewMode={DiffModeEnum.Unified}
          diffFile={diffFile}
          diffViewHideOperator
          diffViewHighlight
          diffViewTheme="dark"
        />
      );
    }

    return null;
  },
  (p, c) => {
    const pInput = p.part.input as any;
    const cInput = c.part.input as any;

    return (
      pInput?.path === cInput?.path &&
      pInput.content === cInput.content &&
      pInput.oldString === cInput.oldString &&
      pInput.newString === cInput.newString &&
      pInput.id === cInput.id &&
      pInput.prompt === cInput.prompt &&
      pInput.description === cInput.description
    );
  }
);

ToolInputView.displayName = "ToolInputView";
