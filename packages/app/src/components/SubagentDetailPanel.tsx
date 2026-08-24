import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";

import { SubagentPreviewView } from "../messages/SubagentPreviewView.js";
import { COLORS } from "../theme/colors.js";
import { formatUsageBrief } from "../utils/format-usage.js";
import { KeyLabel } from "../utils/keyboard-labels.js";
import { resolveAgentSession } from "../utils/session-resolve.js";

import { getStatusColor, getStatusIcon } from "./subagent-status.js";

export const SubagentDetailPanel = ({ subagentId, onBack }: { subagentId: string; onBack: () => void }) => {
  const [tick, setTick] = useState(0);

  const childSession = useMemo(() => resolveAgentSession(subagentId), [subagentId]);

  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  useEffect(() => {
    if (!childSession) return;
    // No `messages` channel: the transcript lives in SubagentPreviewView
    // (throttled via useSubagentMessages). Re-rendering this whole panel per
    // stream chunk would re-run the preview pipeline for every token.
    return childSession.subscribe(
      () => {
        setTick((n) => n + 1);
      },
      { channels: ["usage", "state", "lifecycle"] }
    );
  }, [childSession, subagentId]);

  void tick;

  const snap = childSession?.getSnapshot();

  const displayTitle = snap
    ? snap.name.startsWith("subagent-")
      ? snap.name.slice("subagent-".length)
      : snap.name
    : subagentId;

  const status = snap?.status ?? "idle";

  const usage = snap?.usage.total;

  const usageLabel = usage && (usage.inputTokens > 0 || usage.outputTokens > 0) ? formatUsageBrief(usage) : null;

  const statusIcon = getStatusIcon(status);

  const statusColor = getStatusColor(status);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Box>
          <Text color={statusColor} bold>
            {statusIcon}{" "}
          </Text>
          <Text bold color={COLORS.primary} wrap="truncate">
            {displayTitle}
          </Text>
        </Box>
        <Box>
          <Text color={COLORS.muted} dimColor>
            {status}
          </Text>
          {usageLabel ? (
            <Text color={COLORS.muted} dimColor>
              {" "}
              · {usageLabel}
            </Text>
          ) : null}
          <Text color={COLORS.muted} dimColor>
            {" "}
            · ({KeyLabel.esc} back to task list)
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <SubagentPreviewView subagentId={subagentId} />
      </Box>
    </Box>
  );
};
