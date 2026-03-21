import { DiffView, DiffModeEnum } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { getToolName, type ToolUIPart } from "ai";
import { memo } from "react";

import { useSize } from "../hooks";
import { useDiffFileCache } from "../hooks/use-diff-file-cache";

const { getDiffFile, setDiffFile } = useDiffFileCache.getActions();

export const ToolInputView = memo(
  ({ part }: { part: ToolUIPart }) => {
    const toolName = getToolName(part);

    const width = useSize((s) => s.state.screenWidth);

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
      pInput.newString === cInput.newString
    );
  }
);

ToolInputView.displayName = "ToolInputView";
