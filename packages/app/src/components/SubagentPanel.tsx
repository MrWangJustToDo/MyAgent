import { agentManager, sessionForSubagent, type ManagedAgent } from "@my-agent/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";
import { useSubagentPanel } from "../hooks/use-subagent-panel.js";
import { SubagentPreviewView } from "../messages/SubagentPreviewView.js";
import { COLORS } from "../theme/colors.js";
import { formatUsageBrief } from "../utils/format-usage.js";
import { KeyLabel, listNavHint, pressEscToReturnHint } from "../utils/keyboard-labels.js";

// ============================================================================
// Status display helpers
// ============================================================================

const STATUS_ICON: Record<string, string> = {
  running: ">",
  thinking: ">",
  responding: ">",
  compacting: ">",
  waiting: "⌛",
  awaiting_user: "⌛",
  completed: "✓",
  error: "✗",
  aborted: "⊘",
  idle: "○",
};

function getStatusIcon(status: string): string {
  return STATUS_ICON[status] ?? "?";
}

function getStatusColor(status: string): string {
  if (status === "completed") return COLORS.success;
  if (status === "error") return COLORS.danger;
  if (status === "aborted") return COLORS.muted;
  if (["running", "thinking", "responding", "compacting"].includes(status)) return COLORS.warning;
  return COLORS.muted;
}

function isActiveStatus(status: string): boolean {
  return ["running", "thinking", "responding", "compacting", "waiting", "awaiting_user"].includes(status);
}

type ActiveSubagent = ReturnType<typeof agentManager.getActiveSubagents>[number];

function getTaskLabel(managed: ActiveSubagent | ManagedAgent): string {
  const name = managed.name ?? managed.id;
  return name.startsWith("subagent-") ? name.slice("subagent-".length) : name;
}

const SubagentPanelList = ({
  tasks,
  onSelect,
  onClose,
}: {
  tasks: ManagedAgent[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
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
        const icon = getStatusIcon(task.status);
        const iconColor = isSelected ? COLORS.primary : getStatusColor(task.status);
        return (
          <Box key={task.id}>
            <Text color={isSelected ? COLORS.primary : iconColor} bold={isSelected || isActiveStatus(task.status)}>
              {isSelected ? "❯ " : "  "}
              {icon} {getTaskLabel(task)}
            </Text>
            <Text color={COLORS.muted} dimColor>
              {" "}
              ({task.status})
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

const SubagentPanelDetail = ({ subagentId, onBack }: { subagentId: string; onBack: () => void }) => {
  const [, setTick] = useState(0);

  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  useEffect(() => {
    const session = sessionForSubagent(agentManager, subagentId);
    if (!session) return;
    const bump = () => setTick((n) => n + 1);
    return session.subscribe(
      () => {
        bump();
      },
      { channels: ["messages", "usage", "state", "lifecycle"] }
    );
  }, [subagentId]);

  const managed = agentManager.getAgent(subagentId);
  const childSession = sessionForSubagent(agentManager, subagentId);
  const title = managed ? getTaskLabel(managed) : subagentId;
  const status = managed?.status ?? childSession?.getSnapshot().status ?? "idle";
  const usage = childSession?.getSnapshot().usage.total ?? managed?.usage.getTotal();
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
            {title}
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

/** Full-screen overlay for inspecting active subagent tasks. */
export const SubagentPanel = () => {
  const [ready, setReady] = useState(false);

  const view = useSubagentPanel((s) => s.view);

  const selectedSubagentId = useSubagentPanel((s) => s.selectedSubagentId);

  const { openDetail, close, backToList } = useSubagentPanel.getActions();

  const rootAgentId = useAgent((s) => (s.agent as { id?: string } | null)?.id);
  const rootSession = toRaw(useAgent((s) => s.session));

  const [listRevision, setListRevision] = useState(0);

  // Clear terminal so parent-agent static renderings don't leak into the panel overlay
  useEffect(() => {
    if (typeof process === "object") {
      import("ansi-escapes").then((pkg) => {
        process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0));
      });
    }

    setReady(true);

    if (view === "closed") return;

    const refresh = () => setListRevision((n) => n + 1);
    if (!rootSession) return;
    return rootSession.subscribe(
      (event) => {
        if (event.channel !== "lifecycle") return;
        const type = event.payload.type;
        if (
          type === "subagent:created" ||
          type === "subagent:started" ||
          type === "subagent:completed" ||
          type === "subagent:destroyed" ||
          type === "agent:stop"
        ) {
          refresh();
        }
      },
      { channels: ["lifecycle"] }
    );
  }, [view, rootAgentId, rootSession]);

  const allTasks = useMemo(() => {
    if (!rootAgentId) return [];
    return agentManager.getAllSubagents(rootAgentId);
    // listRevision forces refresh when subagent lifecycle events fire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootAgentId, view, listRevision]);

  if (view === "closed") return null;

  if (!ready) return null;

  if (view === "detail" && selectedSubagentId) {
    return <SubagentPanelDetail subagentId={selectedSubagentId} onBack={backToList} />;
  }

  return <SubagentPanelList tasks={allTasks} onSelect={openDetail} onClose={close} />;
};
