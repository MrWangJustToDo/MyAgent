import { DiffModeEnum, DiffView, type DiffViewRef } from "@git-diff-view/cli";
import { generateDiffFile } from "@git-diff-view/file";
import { forwardRef, memo } from "react";

import { useDiffFileCache } from "../hooks/use-diff-file-cache.js";

const { getDiffFile, setDiffFile } = useDiffFileCache.getActions();

/** Prepend (startLine - 1) empty lines so the diff engine generates correct line numbers */
function padContent(content: string, startLine?: number): string {
  if (!startLine || startLine <= 1) return content;
  return "\n".repeat(startLine - 1) + content;
}

export type EditDiffProps = {
  id: string;
  width: number;
  /**
   * Optional fixed viewport height. When omitted, DiffView uses auto height
   * (full content) — preferred for in-message previews so ↑↓ does not fight the terminal.
   */
  height?: number;
  oldFile: string;
  newFile: string;
  oldPath: string;
  newPath: string;
  startLine?: number;
};

export const EditDiff = memo(
  forwardRef<DiffViewRef, EditDiffProps>(function EditDiff(
    { id, width, height, oldFile, newFile, oldPath, newPath, startLine },
    ref
  ) {
    const paddedOld = padContent(oldFile, startLine);
    const paddedNew = padContent(newFile, startLine);

    const diffFile = getDiffFile(id) || generateDiffFile(oldPath, paddedOld, newPath, paddedNew, "", "");

    setDiffFile(id, diffFile);

    diffFile.initTheme("dark");

    diffFile.init();

    const finalWidth = width;

    return (
      <DiffView
        ref={ref}
        width={finalWidth}
        {...(height != null ? { height } : {})}
        diffViewMode={finalWidth > 20 && oldFile ? DiffModeEnum.Split : DiffModeEnum.Unified}
        diffFile={diffFile}
        diffViewHideOperator
        diffViewHighlight
        diffViewTheme="dark"
      />
    );
  })
);
