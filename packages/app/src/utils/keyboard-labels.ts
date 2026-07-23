/**
 * Terminal (Ink) keyboard chord labels — single source for UI copy.
 *
 * Conventions:
 * - Prefer what Ink actually receives, not desktop-app habits.
 * - TUI chords use **Ctrl**, never Cmd/⌘ (terminals deliver Control; ⌘ is usually
 *   eaten by the host terminal or OS).
 * - Option/Alt+Enter is unreliable on macOS — do not advertise it.
 * - Shift+Enter usually arrives as `return + meta` (ESC+CR), not `return + shift`.
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
 * Never advertise Alt/Option+Enter — macOS terminals usually do not deliver it to Ink.
 */
export function followUpEnterLabel(): string {
  // On macOS advertise Ctrl+Enter as a reliable fallback; elsewhere Shift+Enter is enough.
  return isMacPlatform() ? "Shift/Ctrl+Enter" : KeyLabel.shiftEnter;
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
    { key: KeyLabel.ctrlV, desc: "paste image" },
    { key: KeyLabel.esc, desc: "to abort" },
  ];
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
 * - `shift` / `meta`: Shift+Enter (meta from ESC+CR on most terminals)
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
