import { memo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { EditDiff } from "../components/EditDiff.js";
import { BG } from "../theme/colors.js";

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
}: MessageDiffViewProps) {
  return (
    <HalfLinePaddedBox backgroundColor={BG.toolResult} width={width}>
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
    </HalfLinePaddedBox>
  );
});
