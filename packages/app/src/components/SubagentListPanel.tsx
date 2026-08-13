import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";

import { COLORS } from "../theme/colors.js";
import { listNavHint, pressEscToReturnHint } from "../utils/keyboard-labels.js";
import { resolveAgentSession } from "../utils/session-resolve.js";

import { getStatusColor, getStatusIcon, getTaskLabel, isActiveStatus } from "./subagent-status.js";

import type { AgentSessionSubagentSummary } from "@my-agent/core";

/**
 * One row in the subagent task list.
 *
 * Subscribes to the child session (via Host.connect) for live `state`/`lifecycle`
 * so the row's status stays current without waiting on root lifecycle events.
 * Falls back to the snapshot summary when the child session can't be resolved.
 */
const SubagentTaskRow = ({ task }: { task: AgentSessionSubagentSummary }) => {
  const [tick, setTick] = useState(0);

  const childSession = useMemo(() => resolveAgentSession(task.id), [task.id]);

  useEffect(() => {
    if (!childSession) return;
    return childSession.subscribe(
      () => {
        setTick((n) => n + 1);
      },
      { channels: ["state", "lifecycle"] }
    );
  }, [childSession, task.id]);

  void tick;

  const status = childSession?.getSnapshot().status ?? task.status;
  const icon = getStatusIcon(status);
  const iconColor = getStatusColor(status);

  return (
    <>
      <Text color={iconColor} bold={isActiveStatus(status)}>
        {icon} {getTaskLabel(task)}
      </Text>
      <Text color={COLORS.muted} dimColor>
        {" "}
        ({status})
      </Text>
    </>
  );
};

export const SubagentListPanel = ({
  tasks,
  onSelect,
  onClose,
}: {
  tasks: AgentSessionSubagentSummary[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(tasks.length - 1, i + 1));
      return;
    }
    if (key.return && tasks[selectedIndex]) {
      onSelect(tasks[selectedIndex]!.id);
      return;
    }
    if (key.escape) {
      onClose();
    }
  });

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold color={COLORS.primary}>
          Tasks
        </Text>
        <Text color={COLORS.muted} dimColor>
          No subagent tasks yet.
        </Text>
        <Text color={COLORS.muted} dimColor>
          {pressEscToReturnHint()}
        </Text>
      </Box>
    );
  }

  const activeCount = tasks.filter((t) => isActiveStatus(t.status)).length;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          Tasks
        </Text>
        <Text dimColor>
          {" "}
          ({tasks.length} total{activeCount > 0 ? `, ${activeCount} active` : ""})
        </Text>
        <Text dimColor> {listNavHint("open")}</Text>
      </Box>
      {tasks.map((task, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={task.id}>
            <Text color={isSelected ? COLORS.primary : undefined} bold={isSelected}>
              {isSelected ? "❯ " : "  "}
            </Text>
            <SubagentTaskRow task={task} />
          </Box>
        );
      })}
    </Box>
  );
};
