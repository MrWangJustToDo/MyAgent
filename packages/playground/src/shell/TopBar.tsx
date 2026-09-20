import { usePlaygroundConfig } from "../hooks/use-playground-config.js";
import { useShellState } from "../hooks/use-shell-state.js";
import { Button } from "../ui/Button.js";
import { IconCommand, IconPanel, IconSettings } from "../ui/icons.js";

import type { BreakpointInfo } from "../hooks/use-breakpoint.js";
import type { BootState } from "../hooks/use-shell-state.js";

const bootTone = (boot: BootState) =>
  boot.phase === "error" ? "badge--danger" : boot.phase === "booting" ? "badge--warning" : "badge--success";

const bootLabel = (boot: BootState) =>
  boot.phase === "error" ? "Agent error" : boot.phase === "booting" ? boot.message : "Ready";

export interface TopBarProps {
  breakpoint: BreakpointInfo;
  boot: BootState;
}

/**
 * Persistent shell chrome: identity on the left, connection state in the middle,
 * workspace/settings actions on the right. Labels collapse to icons before any
 * action is dropped, so nothing becomes unreachable on a narrow viewport.
 */
export const TopBar = ({ breakpoint, boot }: TopBarProps) => {
  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const { setConfig } = usePlaygroundConfig.getActions();
  const { setSettingsOpen, setPaletteOpen } = useShellState.getActions();
  const compact = breakpoint.isCompact;

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 3.6 6.1 8 2 12.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M8.4 12.6h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span className="topbar__title">Codent</span>
        {!compact && <span className="topbar__subtitle">Playground</span>}
      </div>

      <span className={`badge ${bootTone(boot)} topbar__status`} title={boot.error ?? boot.message}>
        <span className="badge__dot" aria-hidden="true" />
        {bootLabel(boot)}
      </span>

      <div className="topbar__spacer" />

      {compact ? (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<IconCommand size={14} />}
          aria-label="Open command palette"
          onClick={() => setPaletteOpen(true)}
        />
      ) : (
        <button type="button" className="topbar__palette" onClick={() => setPaletteOpen(true)}>
          <IconCommand size={13} />
          <span className="topbar__palette-label">Search commands</span>
          <kbd>⌘K</kbd>
        </button>
      )}

      <Button
        variant={workspaceVisible ? "secondary" : "ghost"}
        size="sm"
        iconOnly={compact}
        icon={<IconPanel size={14} />}
        aria-pressed={workspaceVisible}
        aria-label={workspaceVisible ? "Hide workspace panel" : "Show workspace panel"}
        onClick={() => setConfig({ workspaceVisible: !workspaceVisible })}
      >
        Workspace
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly={compact}
        icon={<IconSettings size={14} />}
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </Button>
    </header>
  );
};
