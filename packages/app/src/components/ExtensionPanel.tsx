import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { toRaw } from "reactivity-store";

import { syncExtensionCommands } from "../commands/utils/sync-extension-commands.js";
import { useAgent } from "../hooks/use-agent.js";
import { useExtensionPanel } from "../hooks/use-extension-panel.js";
import { COLORS } from "../theme/colors.js";
import { KeyLabel, listNavHint, pressEscToReturnHint } from "../utils/keyboard-labels.js";

import type { ExtensionInfo, ManagedAgent } from "@my-agent/core";

// ============================================================================
// Extension list panel
// ============================================================================

const ExtensionPanelList = ({
  infos,
  onToggle,
  onClose,
}: {
  infos: ExtensionInfo[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(infos.length - 1, i + 1));
      return;
    }
    if ((key.return || input === " ") && infos[selectedIndex]) {
      onToggle(infos[selectedIndex]!.id);
      return;
    }
    if (key.escape) {
      onClose();
    }
  });

  if (infos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold color={COLORS.primary}>
          Extensions
        </Text>
        <Text color={COLORS.muted} dimColor>
          No extensions loaded.
        </Text>
        <Text color={COLORS.muted} dimColor>
          {pressEscToReturnHint()}
        </Text>
      </Box>
    );
  }

  const enabledCount = infos.filter((i) => i.enabled).length;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          Extensions
        </Text>
        <Text dimColor>
          {" "}
          ({enabledCount}/{infos.length} enabled)
        </Text>
        <Text dimColor> {listNavHint("toggle")}</Text>
      </Box>
      {infos.map((info, i) => {
        const isSelected = i === selectedIndex;
        const icon = info.enabled ? "✓" : "○";
        const iconColor = isSelected ? COLORS.primary : info.enabled ? COLORS.success : COLORS.muted;
        return (
          <Box key={info.id} flexDirection="column">
            <Box>
              <Text color={isSelected ? COLORS.primary : iconColor} bold={isSelected}>
                {isSelected ? "❯ " : "  "}
                {icon} {info.id}
              </Text>
              <Text color={COLORS.muted} dimColor>
                {" "}
                v{info.version}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text color={COLORS.muted} dimColor wrap="truncate">
                {info.enabled ? "enabled" : "disabled"}
                {info.error ? ` · error: ${info.error}` : ""}
              </Text>
            </Box>
            {info.tools.length > 0 && (
              <Box marginLeft={4}>
                <Text color={COLORS.muted} dimColor wrap="truncate">
                  tools: {info.tools.join(", ")}
                </Text>
              </Box>
            )}
            {info.commands.length > 0 && (
              <Box marginLeft={4}>
                <Text color={COLORS.muted} dimColor wrap="truncate">
                  commands: /{info.commands.join(", /")}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={COLORS.muted} dimColor>
          {KeyLabel.enter}/{KeyLabel.space} toggle · {KeyLabel.esc} close
        </Text>
      </Box>
    </Box>
  );
};

/** Full-screen overlay for inspecting and toggling extensions. */
export const ExtensionPanel = () => {
  const view = useExtensionPanel((s) => s.view);
  const revision = useExtensionPanel((s) => s.revision);
  const { close, refresh } = useExtensionPanel.getActions();

  const agent = toRaw(useAgent((s) => s.agent)) as ManagedAgent | null;
  const [tick, setTick] = useState(0);

  // Refresh when the panel opens or a toggle happens (revision bump) or when the
  // agent changes — so enabled state and registered artifacts stay in sync.
  useEffect(() => {
    setTick((n) => n + 1);
  }, [view, revision, agent]);

  const infos = useMemo(() => {
    if (!agent?.extensionRunner) return [];
    void tick;
    return agent.extensionRunner.getExtensionInfos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, view, revision, tick]);

  const handleToggle = async (id: string) => {
    const runner = agent?.extensionRunner;
    if (!runner) return;
    const info = runner.getExtensionInfos().find((i) => i.id === id);
    if (!info) return;
    await runner.setEnabled(id, !info.enabled);
    if (agent) syncExtensionCommands(agent);
    refresh();
  };

  if (view === "closed") return null;

  return <ExtensionPanelList infos={infos} onToggle={handleToggle} onClose={close} />;
};
