import { Box, Text } from "ink";
import { memo } from "react";

import { EditDiff } from "../components/EditDiff";
// import { SplitNode } from "../components/SplitNode";
import { usePreviewEdit, useSize } from "../hooks";

/**
 * Renders the edit_file tool's input as a diff preview.
 *
 * Shows two layers:
 *  1. A full-file diff (original file → file after all edits applied).
 *  2. The per-edit fragment diffs (oldString → newString for each edit),
 *     which give a focused view of each individual change.
 *
 * The full-file content is sourced from two places depending on lifecycle:
 *  - After the tool executed (output-available): read `oldFile`/`newFile`
 *    directly from the tool output. This is authoritative and stays correct
 *    even if the file is later modified by other edits.
 *  - Before execution (approval phase): compute on the fly via `previewEdit`,
 *    which reads the current file and applies the edits in memory.
 */
export const EditFilePreview = memo(function EditFilePreview({
  toolCallId,
  path,
  edits,
  approved,
  output,
}: {
  toolCallId: string;
  path: string;
  edits: Array<{ oldString: string; newString: string; startLine?: number; replaceAll?: boolean }>;
  approved: boolean | undefined;
  bodyWidth: number;
  output?: { oldFile?: string; newFile?: string };
}) {
  const width = useSize((s) => s.state.screenWidth) - 8;
  const borderColor = typeof approved === "boolean" ? (approved ? "greenBright" : "redBright") : "#555555";

  // Authoritative source once the tool has run: prefer output over preview.
  const hasOutput = output && typeof output.oldFile === "string" && typeof output.newFile === "string";
  const preview = usePreviewEdit(
    hasOutput ? undefined : toolCallId,
    hasOutput ? undefined : path,
    hasOutput ? undefined : edits
  );

  const oldFile = hasOutput ? output!.oldFile! : preview?.oldFile;
  const newFile = hasOutput ? output!.newFile! : preview?.newFile;

  return (
    <Box paddingLeft={2}>
      <Box flexDirection="column" borderColor={borderColor} borderStyle="single">
        {/* Full-file diff: original file → file after all edits applied */}
        {oldFile !== undefined && newFile !== undefined ? (
          <EditDiff
            id={toolCallId + "-full"}
            width={width}
            oldPath={path}
            oldFile={oldFile}
            newPath={path}
            newFile={newFile}
          />
        ) : (
          <Text dimColor> loading full file preview… </Text>
        )}
      </Box>
    </Box>
  );
});
