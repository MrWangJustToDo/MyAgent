import { DiffModeEnum, DiffView } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { memo } from "react";

import { useDiffFileCache } from "../hooks/use-diff-file-cache";

const { getDiffFile, setDiffFile } = useDiffFileCache.getActions();

/** Prepend (startLine - 1) empty lines so the diff engine generates correct line numbers */
function padContent(content: string, startLine?: number): string {
  if (!startLine || startLine <= 1) return content;
  return "\n".repeat(startLine - 1) + content;
}

export const EditDiff = memo(function EditDiff({
  id,
  width,
  oldFile,
  newFile,
  oldPath,
  newPath,
  startLine,
}: {
  id: string;
  width: number;
  oldFile: string;
  newFile: string;
  oldPath: string;
  newPath: string;
  startLine?: number;
}) {
  const paddedOld = padContent(oldFile, startLine);
  const paddedNew = padContent(newFile, startLine);

  const diffFile = getDiffFile(id) || generateDiffFile(oldPath, paddedOld, newPath, paddedNew, "", "");

  setDiffFile(id, diffFile);

  diffFile.initTheme("dark");

  diffFile.init();

  const finalWidth = width;

  return (
    <DiffView
      width={finalWidth}
      diffViewMode={finalWidth > 20 && oldFile ? DiffModeEnum.Split : DiffModeEnum.Unified}
      diffFile={diffFile}
      diffViewHideOperator
      diffViewHighlight
      diffViewTheme="dark"
    />
  );
});
