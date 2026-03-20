import { DiffView, DiffModeEnum } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { memo } from "react";

import { useSize } from "../hooks";

import type { ToolInvocationUIPart } from "./ToolCallPartView";
import type { DiffFile } from "@git-diff-view/cli";

const map = new Map<string, DiffFile>();

globalThis.diffFileMap = map;

export const ToolInputView = memo(
  ({ part }: { part: ToolInvocationUIPart }) => {
    const toolName = part.toolName || part.type.slice(5);

    const width = useSize((s) => s.state.screenWidth);

    if (toolName === "write_file") {
      const content = part.input as { content?: string; path?: string };

      if (!content) return null;

      const id = part.toolCallId;

      const diffFile = map.get(id) || generateDiffFile("", "", content.path || "", content.content || "", "", "");

      map.set(id, diffFile);

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
        map.get(id) ||
        generateDiffFile(
          content.path || "",
          content.oldString || "",
          content.path || "",
          content.newString || "",
          "",
          ""
        );

      map.set(id, diffFile);

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
