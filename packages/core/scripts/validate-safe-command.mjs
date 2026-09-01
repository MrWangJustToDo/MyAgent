/**
 * Validation for the command-safety layer (run_command).
 *
 * Covers the pure decision surfaces that don't require tree-sitter WASM:
 * - arity normalization (commandPrefix / normalizedCommand)
 * - approval policy matrix (evaluateCommandApproval: allow / deny / ask)
 * - subagent deny semantics (ask downgraded to deny, with a model-readable reason)
 *
 * Tree-sitter parsing itself is host-provided (CoreEnv.locateTreeSitterGrammar);
 * this script intentionally avoids it so it runs in any runtime.
 *
 * Run: pnpm --filter @my-agent/core run validate:safe-command
 */

import assert from "node:assert/strict";

import { SUBAGENT_DENY_MESSAGE, commandPrefix, evaluateCommandApproval, normalizedCommand } from "../dist/dev.mjs";

// ---------------------------------------------------------------------------
// Arity normalization (pure)
// ---------------------------------------------------------------------------

assert.deepEqual(commandPrefix(["git", "status"]), ["git", "status"]);
assert.deepEqual(commandPrefix(["git", "checkout", "main"]), ["git", "checkout"]);
assert.deepEqual(commandPrefix(["npm", "install", "lodash"]), ["npm", "install"]);
assert.deepEqual(commandPrefix(["npm", "exec", "vite"]), ["npm", "exec", "vite"]);
assert.deepEqual(commandPrefix(["cat", "README.md"]), ["cat"]);
assert.deepEqual(commandPrefix([]), []);

assert.equal(normalizedCommand(["git", "status"]), "git status");
assert.equal(normalizedCommand(["git", "log", "--oneline"]), "git log");
assert.equal(normalizedCommand(["ls", "-la"]), "ls");

// ---------------------------------------------------------------------------
// Approval policy — built-in default (pure decision on a report)
// ---------------------------------------------------------------------------

const baseReport = {
  ok: true,
  commands: [
    {
      tokens: ["git", "status"],
      source: "git status",
      prefix: ["git", "status"],
      normalized: "git status",
      isReadOnly: true,
      fileOps: [],
    },
  ],
  anyExternalDir: false,
  anyWriteOp: false,
};

// Project-internal read-only command → allow for both root and subagent.
assert.equal(evaluateCommandApproval(baseReport, { agentKind: "root" }).action, "allow");
assert.equal(evaluateCommandApproval(baseReport, { agentKind: "subagent" }).action, "allow");

// Write operation → ask (root) / deny (subagent).
const writeReport = {
  ...baseReport,
  commands: [{ ...baseReport.commands[0], normalized: "rm", isReadOnly: false }],
  anyWriteOp: true,
};
assert.equal(evaluateCommandApproval(writeReport, { agentKind: "root" }).action, "ask");
assert.equal(evaluateCommandApproval(writeReport, { agentKind: "subagent" }).action, "deny");
assert.match(evaluateCommandApproval(writeReport, { agentKind: "subagent" }).reason ?? "", /insufficient permissions/i);

// External directory → ask (root) / deny (subagent).
const externalReport = {
  ...baseReport,
  commands: [{ ...baseReport.commands[0], isReadOnly: true }],
  anyExternalDir: true,
};
assert.equal(evaluateCommandApproval(externalReport, { agentKind: "root" }).action, "ask");
assert.equal(evaluateCommandApproval(externalReport, { agentKind: "subagent" }).action, "deny");

// Parse failure (ok:false) → conservative: ask (root) / deny (subagent).
const parseFailReport = { ok: false, commands: [], anyExternalDir: true, anyWriteOp: true };
assert.equal(evaluateCommandApproval(parseFailReport, { agentKind: "root" }).action, "ask");
assert.equal(evaluateCommandApproval(parseFailReport, { agentKind: "subagent" }).action, "deny");

// Empty command list → not allowed by default.
const emptyReport = { ok: true, commands: [], anyExternalDir: false, anyWriteOp: false };
assert.equal(evaluateCommandApproval(emptyReport, { agentKind: "root" }).action, "ask");

// ---------------------------------------------------------------------------
// Approval policy — explicit rules
// ---------------------------------------------------------------------------

const denyRules = evaluateCommandApproval(baseReport, {
  agentKind: "root",
  rules: { deny: ["git status"] },
});
assert.equal(denyRules.action, "deny");

const allowRules = evaluateCommandApproval(baseReport, {
  agentKind: "root",
  rules: { allow: ["git status"] },
});
assert.equal(allowRules.action, "allow");

// Subagent deny message is exported for the model-facing tool error.
assert.ok(typeof SUBAGENT_DENY_MESSAGE === "string" && SUBAGENT_DENY_MESSAGE.length > 0);

console.log("validate:safe-command OK");
