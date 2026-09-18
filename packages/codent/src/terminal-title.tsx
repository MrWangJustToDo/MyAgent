import { useAgent, useConfig } from "@codent/app";
import { getEnv, type AgentStatus } from "@codent/core";
import { useEffect } from "react";

// OSC 0 — set the terminal window title (and icon name, on terminals that
// support it). This is a native xterm escape sequence, not a third-party
// feature; every modern terminal emulator renders it.
const OSC_TITLE = "\x1b]0;";
const OSC_END = "\x07";

const DEFAULT_APP_NAME = "Codent";

const STATUS_SUFFIX: Record<AgentStatus, string> = {
  idle: "",
  running: "· working",
  thinking: "· thinking",
  responding: "· responding",
  waiting: "· working",
  awaiting_user: "· awaiting input",
  compacting: "· compacting",
  error: "· error",
  aborted: "· aborted",
  completed: "· done",
};

/** Status icon shown at the front of the title (works in any emoji-capable terminal). */
const STATUS_ICON: Record<AgentStatus, string> = {
  idle: "",
  running: "⚡",
  thinking: "💭",
  responding: "💬",
  waiting: "⏳",
  awaiting_user: "❓",
  compacting: "🧠",
  error: "❌",
  aborted: "⏹",
  completed: "✅",
};

/** Short label for the active workspace (CoreEnv rootPath basename). */
function workspaceLabel(): string {
  try {
    const root = getEnv()?.rootPath;
    if (root) return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
  } catch {
    // CoreEnv may not be registered yet — fall through to cwd.
  }
  return process.cwd().split(/[\\/]/).filter(Boolean).pop() ?? "workspace";
}

function writeTitle(title: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`${OSC_TITLE}${title}${OSC_END}`);
}

function setTitle(appName: string, status: AgentStatus): void {
  const icon = STATUS_ICON[status];
  const suffix = STATUS_SUFFIX[status];
  const prefix = icon ? `${icon} ` : "";
  const title = suffix
    ? `${prefix}${workspaceLabel()} · ${appName} ${suffix}`
    : `${prefix}${workspaceLabel()} · ${appName}`;
  writeTitle(title);
}

function restoreTitle(appName: string): void {
  writeTitle(`${workspaceLabel()} · ${appName}`);
}

/**
 * Mirrors the agent status into the terminal window title via OSC 0.
 * Renders nothing — a side-effect-only sibling of {@link App}.
 */
export function TerminalTitle() {
  const session = useAgent((s) => s.session);
  // The window title carries the host's display name (see `AppConfig.productName`).
  const appName = useConfig((s) => s.config.productName) || DEFAULT_APP_NAME;

  useEffect(() => {
    if (!session) return;

    setTitle(appName, session.getSnapshot().status);

    const unsub = session.subscribe(
      (event) => {
        if (event.channel === "state") setTitle(appName, event.payload.status);
      },
      { channels: ["state"] }
    );

    return () => {
      unsub();
      restoreTitle(appName);
    };
  }, [session, appName]);

  return null;
}
