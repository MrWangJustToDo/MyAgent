import { usePlaygroundConfig } from "../hooks/use-playground-config.js";
import { usePreviewPorts } from "../hooks/use-preview-ports.js";
import { useShellState } from "../hooks/use-shell-state.js";

import type { BreakpointInfo } from "../hooks/use-breakpoint.js";
import type { TerminalFit } from "../hooks/use-terminal-fit.js";

export interface StatusBarProps {
  breakpoint: BreakpointInfo;
  fit: TerminalFit;
}

/**
 * Low-key telemetry: workspace location, connection mode, live preview ports and
 * the terminal's derived grid. Secondary items drop first on narrow viewports.
 */
export const StatusBar = ({ breakpoint, fit }: StatusBarProps) => {
  const providerServerUrl = usePlaygroundConfig((s) => s.providerServerUrl);
  const ports = usePreviewPorts((s) => s.ports);
  const activePort = usePreviewPorts((s) => s.activePort);
  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const previewUrl = useShellState((s) => s.previewUrl);

  const items: { key: string; label: string; title?: string }[] = [
    { key: "root", label: "/home/workspace", title: "WebContainer project root" },
    {
      key: "mode",
      label: providerServerUrl.trim() ? "proxy mode" : "direct mode",
      title: providerServerUrl.trim() ? "Model provider keys live on the server" : "Model provider keys are local",
    },
  ];

  if (workspaceVisible && previewUrl) {
    items.push({ key: "preview", label: `preview :${activePort ?? "—"}`, title: previewUrl });
  } else if (ports.length > 0) {
    items.push({ key: "ports", label: `${ports.length} port${ports.length > 1 ? "s" : ""}` });
  }

  return (
    <footer className="statusbar">
      {items.map((item) => (
        <span key={item.key} className="statusbar__item" title={item.title}>
          {item.label}
        </span>
      ))}

      <div className="statusbar__spacer" />

      {!breakpoint.isCompact && (
        <span className="statusbar__item statusbar__item--muted" title="Terminal columns">
          {fit.columns} cols · {fit.fontSize}px
        </span>
      )}
    </footer>
  );
};
