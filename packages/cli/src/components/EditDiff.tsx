import { DiffModeEnum, DiffView } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { memo } from "react";

import { useDiffFileCache } from "../hooks/use-diff-file-cache";

const { getDiffFile, setDiffFile } = useDiffFileCache.getActions();

export const EditDiff = memo(
  ({
    id,
    width,
    oldFile,
    newFile,
    oldPath,
    newPath,
  }: {
    id: string;
    width: number;
    oldFile: string;
    newFile: string;
    oldPath: string;
    newPath: string;
  }) => {
    const diffFile = getDiffFile(id) || generateDiffFile(oldPath, oldFile, newPath, newFile, "", "");

    setDiffFile(id, diffFile);

    diffFile.initTheme("dark");

    diffFile.init();

    return (
      <DiffView
        width={width}
        diffViewMode={DiffModeEnum.Unified}
        diffFile={diffFile}
        diffViewHideOperator
        diffViewHighlight
        diffViewTheme="dark"
      />
    );
  }
);
