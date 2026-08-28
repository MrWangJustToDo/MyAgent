/**
 * Command approval policy — decide allow / deny / ask for a command safety report.
 *
 * Decision is a three-way `action`. The *disposition* of `ask` is left to the
 * caller: the main agent keeps the tool-call pending (y/n prompt), while a
 * subagent treats it as a denial (no approval UI). To keep subagents safe,
 * {@link evaluateCommandApproval} already downgrades `ask` → `deny` when
 * `agentKind === "subagent"`.
 *
 * Built-in default: project-internal read-only commands are auto-approved;
 * any write operation, external path, or parse failure requires approval.
 * Optional `rules` (allow/deny normalized-prefix patterns) override the
 * default and are reserved for future persisted rule files.
 */

import type { CommandSafetyReport } from "./command-analyzer.js";

export interface CommandApprovalRules {
  /** Normalized-prefix patterns that are always allowed (e.g. `"git add *"`). */
  allow?: string[];
  /** Normalized-prefix patterns that are always denied (e.g. `"rm *"`). */
  deny?: string[];
}

export type CommandApprovalAction = "allow" | "deny" | "ask";

export interface CommandApprovalDecision {
  action: CommandApprovalAction;
  /** Human/LLM-readable reason (used for denials). */
  reason?: string;
}

/** Subagent denial reason — surfaced to the model via the tool error. */
export const SUBAGENT_DENY_MESSAGE =
  "This command requires approval that subagents do not have (insufficient permissions). " +
  "Ask the main agent to run it for you.";

function matchesRules(patterns: string[] | undefined, normalized: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    const pattern = p.trim();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return normalized.startsWith(pattern.slice(0, -1).trim());
    return normalized === pattern;
  });
}

/**
 * Evaluate an approval decision for a command safety report.
 *
 * Rule order: explicit deny > explicit allow > built-in default. The default
 * auto-approves only when every command is read-only and no file path escapes
 * the project root; anything else asks (root) or denies (subagent).
 */
export function evaluateCommandApproval(
  report: CommandSafetyReport,
  options: { agentKind: "root" | "subagent"; rules?: CommandApprovalRules }
): CommandApprovalDecision {
  const { rules, agentKind } = options;

  // Explicit deny rules take priority.
  if (rules?.deny && report.commands.some((c) => matchesRules(rules.deny, c.normalized))) {
    return { action: "deny", reason: "This command is denied by approval rules." };
  }

  // Explicit allow rules apply when every command matches.
  if (
    rules?.allow &&
    report.commands.length > 0 &&
    report.commands.every((c) => matchesRules(rules.allow, c.normalized))
  ) {
    return { action: "allow" };
  }

  // Built-in default: auto-approve project-internal read-only commands.
  const allowDefault =
    report.ok &&
    report.commands.length > 0 &&
    !report.anyWriteOp &&
    !report.anyExternalDir &&
    report.commands.every((c) => c.isReadOnly);
  if (allowDefault) {
    return { action: "allow" };
  }

  // Anything else requires approval. Subagents have no approval UI, so deny.
  if (agentKind === "subagent") {
    return { action: "deny", reason: SUBAGENT_DENY_MESSAGE };
  }
  return { action: "ask" };
}
