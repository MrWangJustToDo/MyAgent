import { agentManager } from "@my-agent/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";

import { useAgent } from "../hooks/use-agent.js";
import { useSubagentPanel } from "../hooks/use-subagent-panel.js";
import { SubagentPreviewView } from "../messages/SubagentPreviewView.js";
import { COLORS } from "../theme/colors.js";

type ActiveSubagent = ReturnType<typeof agentManager.getActiveSubagents>[number];

function getTaskLabel(managed: ActiveSubagent): string {
  const name = managed.name ?? managed.id;
  return name.startsWith("subagent-") ? name.slice("subagent-".length) : name;
}

const SubagentPanelList = ({
  tasks,
  onSelect,
  onClose,
}: {
  tasks: ActiveSubagent[];
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
          Running Tasks
        </Text>
        <Text color={COLORS.muted} dimColor>
          No active subagent tasks.
        </Text>
        <Text color={COLORS.muted} dimColor>
          Press Esc to return.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          Running Tasks
        </Text>
        <Text dimColor> (↑↓ navigate, Enter open, Esc back)</Text>
      </Box>
      {tasks.map((task, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={task.id}>
            <Text color={isSelected ? COLORS.primary : COLORS.muted} bold={isSelected}>
              {isSelected ? "❯ " : "  "}
              {getTaskLabel(task)}
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
  useInput((input, key) => {
    if (key.escape) onBack();
  });

  const managed = agentManager.getAgent(subagentId);
  const title = managed ? getTaskLabel(managed) : subagentId;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          {title}
        </Text>
        <Text dimColor> (Esc back to task list)</Text>
      </Box>
      <SubagentPreviewView subagentId={subagentId} />
    </Box>
  );
};

/** Full-screen overlay for inspecting active subagent tasks. */
export const SubagentPanel = () => {
  const view = useSubagentPanel((s) => s.view);
  const selectedSubagentId = useSubagentPanel((s) => s.selectedSubagentId);
  const { openDetail, close, backToList } = useSubagentPanel.getActions();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const rootAgentId = useAgent((s) => (s.agent as { id?: string } | null)?.id);
  const [listRevision, setListRevision] = useState(0);

  useEffect(() => {
    if (view === "closed") return;
    const refresh = () => setListRevision((n) => n + 1);
    const unsubs = [
      agentManager.on("subagent:created", refresh),
      agentManager.on("subagent:started", refresh),
      agentManager.on("subagent:completed", refresh),
      agentManager.on("subagent:ui-update", refresh),
      agentManager.on("agent:stop", refresh),
    ];
    return () => unsubs.forEach((u) => u());
  }, [view]);

  const runningTasks = useMemo(() => {
    if (!rootAgentId) return [];
    return agentManager.getActiveSubagents(rootAgentId);
    // listRevision forces refresh when subagent lifecycle events fire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootAgentId, view, listRevision]);

  if (view === "closed") return null;

  if (view === "detail" && selectedSubagentId) {
    return <SubagentPanelDetail subagentId={selectedSubagentId} onBack={backToList} />;
  }

  return <SubagentPanelList tasks={runningTasks} onSelect={openDetail} onClose={close} />;
};
