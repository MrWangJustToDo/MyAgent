/**
 * Built-in skill: `write-extension` — how to author a codent extension.
 *
 * Content is a module body shipped as a `Skill` object rather than a `SKILL.md`
 * asset, so tsdown inlines it into the published tarball and the release contract
 * (`files`, `dependencies`, `validate:self-contained`) is untouched.
 *
 * The body lives in `write-extension.md.ts` because a single file with 320+ lines
 * of embedded markdown plus its schema assertions exceeds the 400-line budget.
 */

import { writeExtensionBody } from "./write-extension.md.js";

import type { Skill } from "../types.js";

/**
 * Synthetic path for built-in skills. Nothing reads `Skill.path` for I/O — it is
 * carried for diagnostics only — so `builtin:<name>` marks the origin without
 * pretending to be a real file.
 */
export const BUILTIN_SKILL_PATH_PREFIX = "builtin:";

export const writeExtensionSkill: Skill = {
  name: "write-extension",
  description:
    "Write a codent extension: tools, slash commands, hooks, turn context, UI surfaces. Use when the user wants to add a tool/command/hook or extend agent behavior.",
  body: writeExtensionBody,
  path: `${BUILTIN_SKILL_PATH_PREFIX}write-extension`,
  source: "builtin",
  metadata: {
    name: "write-extension",
    description:
      "Write a codent extension: tools, slash commands, hooks, turn context, UI surfaces. Use when the user wants to add a tool/command/hook or extend agent behavior.",
    metadata: { version: "1.0.0" },
  },
};
