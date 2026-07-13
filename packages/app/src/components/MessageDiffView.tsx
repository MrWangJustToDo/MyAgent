import { memo, useCallback, useEffect, useRef } from "@my-react/react";
import { Box, Text } from "ink";

import { useMessageDiffFocus } from "../hooks/use-message-diff-focus.js";
import { useStaticContext } from "../messages/StaticContext.js";
import { COLORS } from "../theme/colors.js";

import { EditDiff } from "./EditDiff.js";

import type { DiffViewRef } from "@git-diff-view/cli";

export type MessageDiffViewProps = {
  diffId: string;
  toolCallId: string;
  approvalId?: string;
  width: number;
  height?: number;
  oldFile: string;
  newFile: string;
  oldPath: string;
  newPath: string;
  startLine?: number;
};

export const MessageDiffView = memo(function MessageDiffView({
  diffId,
  toolCallId,
  approvalId,
  width,
  height,
  oldFile,
  newFile,
  oldPath,
  newPath,
  startLine,
}: MessageDiffViewProps) {
  const { staticMessage } = useStaticContext();
  const diffRef = useRef<DiffViewRef>(null);
  const focusLabel = useMessageDiffFocus((s) => {
    const entry = s.entries[s.selectedIndex];
    const isSelected = !staticMessage && s.entries.length > 0 && entry?.toolCallId === toolCallId;
    return isSelected ? { index: s.selectedIndex + 1, count: s.entries.length } : null;
  });

  useEffect(() => {
    if (staticMessage) return;
    const { register, unregister } = useMessageDiffFocus.getActions();
    register({ toolCallId, approvalId });
    return () => unregister(toolCallId);
  }, [approvalId, staticMessage, toolCallId]);

  const setDiffRef = useCallback(
    (instance: DiffViewRef | null) => {
      diffRef.current = instance;
      if (!staticMessage) {
        useMessageDiffFocus.getActions().setScrollRef(toolCallId, instance);
      }
    },
    [staticMessage, toolCallId]
  );

  if (staticMessage) {
    return (
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
    );
  }

  const showFocusHint = focusLabel !== null && focusLabel.count > 1;

  return (
    <Box flexDirection="column">
      {showFocusHint && focusLabel && (
        <Box paddingX={1} paddingY={0}>
          <Text color={COLORS.primary} dimColor>
            Selected diff ({focusLabel.index}/{focusLabel.count}) · Tab switch · ↑↓ scroll
          </Text>
        </Box>
      )}
      <Box borderStyle={focusLabel ? "double" : undefined} borderColor={focusLabel ? COLORS.primary : undefined}>
        <EditDiff
          ref={setDiffRef}
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
    </Box>
  );
});
