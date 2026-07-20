import { Box } from "ink";
import { memo } from "react";

import { BG } from "../theme/colors.js";

import { EditDiff } from "./EditDiff.js";

export type MessageDiffViewProps = {
  diffId: string;
  width: number;
  /** Optional fixed height; omit for auto (full content) height. */
  height?: number;
  oldFile: string;
  newFile: string;
  oldPath: string;
  newPath: string;
  startLine?: number;
  /** Approval / status frame color (defaults to {@link BG.border}). */
  frameColor?: string;
};

export const MessageDiffView = memo(function MessageDiffView({
  diffId,
  width,
  height,
  oldFile,
  newFile,
  oldPath,
  newPath,
  startLine,
  frameColor,
}: MessageDiffViewProps) {
  return (
    <Box borderStyle="single" borderColor={frameColor ?? BG.border}>
      <EditDiff
        id={diffId}
        width={width}
        height={height}
        oldPath={oldPath}
        oldFile={oldFile}
        newPath={newPath}
        newFile={newFile}
        startLine={startLine}
      />
    </Box>
  );
});
