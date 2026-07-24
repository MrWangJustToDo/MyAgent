/**
 * Terminal (Ink) keyboard chord labels — single source for UI copy.
 *
 * Conventions:
 * - Prefer what Ink actually receives, not desktop-app habits.
 * - TUI chords use **Ctrl**, never Cmd/⌘ (terminals deliver Control; ⌘ is usually
 *   eaten by the host terminal or OS).
 * - Option/Alt+Enter sends \x1b\r (ESC+CR) which parseKeypress detects
 *   as `meta+return` — this is the reliable way to get a modified Enter.
 * - On macOS terminals, Shift+Enter sends \r like plain Enter and cannot be
 *   distinguished from plain Enter, so it will submit rather than insert a newline.
 * - Platform comes from CoreEnv (`getPlatform`), never `process.platform`.
 */

import { getEnv, hasCoreEnv } from "@my-agent/core";

/** Cached CoreEnv platform id (`darwin`, `linux`, `win32`, …). */
let cachedPlatform: string | undefined;

/**
 * Refresh the cached platform from CoreEnv.
 * Call after `registerCoreEnv` (e.g. during workspace / agent bootstrap).
 */
export async function refreshKeyboardPlatform(): Promise<string | undefined> {
  if (!hasCoreEnv()) {
    cachedPlatform = undefined;
    return undefined;
  }
  cachedPlatform = await getEnv().getPlatform();
  return cachedPlatform;
}

/** Last CoreEnv platform from {@link refreshKeyboardPlatform}, if any. */
export function getCachedKeyboardPlatform(): string | undefined {
  return cachedPlatform;
}

export function isMacPlatform(): boolean {
  return cachedPlatform === "darwin";
}

/** Canonical chord strings for tips / help / footers. */
export const KeyLabel = {
  enter: "Enter",
  esc: "Esc",
  slash: "/",
  tab: "Tab",
  space: "Space",
  upDown: "↑↓",
  leftRight: "←→",
  y: "y",
  n: "n",
  r: "R",
  ctrlA: "Ctrl+A",
  ctrlC: "Ctrl+C",
  ctrlE: "Ctrl+E",
  ctrlT: "Ctrl+T",
  ctrlU: "Ctrl+U",
  ctrlV: "Ctrl+V",
  shiftEnter: "Shift+Enter",
  shiftTab: "Shift+Tab",
} as const;

export type KeyLabelId = keyof typeof KeyLabel;

/** Chord that maps to `key.meta || key.shift` for Enter in typical terminals. */
export function shiftEnterLabel(): string {
  return KeyLabel.shiftEnter;
}

/**
 * Follow-up chord while the agent is running.
 * On macOS, Option+Enter sends \x1b\r which parseKeypress detects as meta+return.
 */
export function followUpEnterLabel(): string {
  // On macOS advertise Ctrl+Enter as a reliable fallback; Option+Enter is the meta key.
  return isMacPlatform() ? "Option/Ctrl+Enter" : KeyLabel.shiftEnter;
}

/** Idle multi-line insert chord. */
export function newlineEnterLabel(): string {
  return shiftEnterLabel();
}

export function exitAbortLabel(): string {
  return `${KeyLabel.ctrlC} / ${KeyLabel.esc}`;
}

export function approveDenyLabel(): string {
  return `${KeyLabel.y} / ${KeyLabel.n}`;
}

/** Header tip row — keys come from {@link KeyLabel}. */
export function headerShortcutTips(): ReadonlyArray<{ key: string; desc: string }> {
  return [
    { key: KeyLabel.slash, desc: "for commands" },
    { key: KeyLabel.shiftTab, desc: "plan mode" },
    { key: KeyLabel.ctrlE, desc: "workspace" },
    { key: KeyLabel.ctrlT, desc: "task panel" },
    { key: KeyLabel.esc, desc: "to abort" },
  ];
}

export interface ShortcutSection {
  title: string;
  lines: ReadonlyArray<{ key: string; desc: string }>;
}

/** Full shortcut reference for `/shortcuts` (and docs). */
export function getKeyboardShortcutSections(): ShortcutSection[] {
  const modifiedEnter = followUpEnterLabel();
  const newline = newlineEnterLabel();
  return [
    {
      title: "Chat",
      lines: [
        { key: KeyLabel.enter, desc: "Submit prompt (while running: queue steer)" },
        { key: newline, desc: "Insert newline when idle" },
        { key: modifiedEnter, desc: "Queue follow-up while running" },
        { key: KeyLabel.esc, desc: "Abort current run / dismiss UI" },
        { key: KeyLabel.ctrlC, desc: "Exit the app" },
        { key: KeyLabel.ctrlU, desc: "Clear input" },
        { key: KeyLabel.ctrlA, desc: "Select all input" },
        { key: KeyLabel.ctrlV, desc: "Paste image from clipboard" },
        { key: KeyLabel.slash, desc: "Open slash commands" },
      ],
    },
    {
      title: "Panels",
      lines: [
        { key: KeyLabel.shiftTab, desc: "Toggle plan mode" },
        { key: KeyLabel.ctrlE, desc: "Workspace panel" },
        { key: KeyLabel.ctrlT, desc: "Task / subagent panel" },
      ],
    },
    {
      title: "Approvals",
      lines: [
        { key: KeyLabel.y, desc: "Approve tool (when input empty)" },
        { key: KeyLabel.n, desc: "Deny tool / enter reason" },
      ],
    },
    {
      title: "Navigation",
      lines: [
        { key: KeyLabel.upDown, desc: "History / autocomplete / lists" },
        { key: KeyLabel.tab, desc: "Accept autocomplete suggestion" },
        { key: `${KeyLabel.esc} (autocomplete)`, desc: "Dismiss suggestions" },
      ],
    },
  ];
}

/** Format shortcut sections for CommandOutput / terminal. */
export function formatKeyboardShortcutsHelp(): string {
  const sections = getKeyboardShortcutSections();
  const lines: string[] = ["Keyboard shortcuts", ""];
  for (const section of sections) {
    lines.push(section.title);
    for (const row of section.lines) {
      lines.push(`  ${row.key.padEnd(28)} ${row.desc}`);
    }
    lines.push("");
  }
  lines.push(`Tip: /theme, /display, /plan, /resume open option menus after Tab/Enter.`);
  return lines.join("\n").trimEnd();
}

/** Workspace panel footer hint. */
export function workspacePanelHint(): string {
  return `${KeyLabel.tab} preview/diff · ${KeyLabel.leftRight} focus · ${KeyLabel.upDown} scroll · ${KeyLabel.enter} open · ${KeyLabel.r} refresh · ${KeyLabel.ctrlE}/${KeyLabel.esc} close`;
}

/** Busy-agent footer: steer / follow-up / abort. */
export function busyQueueHint(steerCount: number, followUpCount: number): string {
  const steer = `${KeyLabel.enter}: queue steer${steerCount > 0 ? ` (${steerCount})` : ""}`;
  const follow = `${followUpEnterLabel()}: follow-up${followUpCount > 0 ? ` (${followUpCount})` : ""}`;
  return `${steer} | ${follow} | ${KeyLabel.esc}: abort`;
}

export function freeformSubmitHint(): string {
  return `Submit: ${KeyLabel.enter} | Cancel: ${KeyLabel.esc}`;
}

export function approvalKeysHint(): string {
  return `${KeyLabel.y}: approve | ${KeyLabel.n}: deny`;
}

/** e.g. "↑↓ navigate, Enter open, Esc back" */
export function listNavHint(action: string, back = "back"): string {
  return `(${KeyLabel.upDown} navigate, ${KeyLabel.enter} ${action}, ${KeyLabel.esc} ${back})`;
}

export function pressEscToReturnHint(): string {
  return `Press ${KeyLabel.esc} to return.`;
}

/** ask_user / select-list footer hints. */
export function selectListHint(options: { multiSelect: boolean; cursorOnFreeform: boolean }): string {
  const { multiSelect, cursorOnFreeform } = options;
  if (multiSelect) {
    return cursorOnFreeform
      ? `${KeyLabel.upDown} | ${KeyLabel.space}: toggle | →: edit answer | ${KeyLabel.enter}: submit`
      : `${KeyLabel.upDown} | ${KeyLabel.space}: toggle | ${KeyLabel.enter}: submit`;
  }
  return cursorOnFreeform
    ? `${KeyLabel.upDown} | →: edit answer | ${KeyLabel.enter}: submit`
    : `${KeyLabel.upDown} | ${KeyLabel.enter}: select`;
}

/**
 * True when the user pressed a modified Enter that should mean follow-up (busy)
 * or newline (idle) — not a plain submit/steer.
 *
 * - `meta` + return: Option+Enter on macOS / Alt+Enter on Linux
 *   (ESC+CR, detected as meta)
 * - `shift` + return: Shift+Enter (only works on terminals that send \x1b\r;
 *   on macOS terminals Shift+Enter sends \r like plain Enter and cannot be
 *   distinguished — use Option+Enter instead)
 * - `ctrl` + return: Ctrl+Enter
 * - `ctrl` + `\n`: Ctrl+J (some terminals map Ctrl+Enter this way)
 */
export function isModifiedEnter(
  inputChar: string,
  key: { return?: boolean; shift?: boolean; meta?: boolean; ctrl?: boolean }
): boolean {
  if (key.return && (key.shift || key.meta || key.ctrl)) return true;
  if (key.ctrl && inputChar === "\n") return true;
  return false;
}
