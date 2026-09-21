/**
 * Built-in skills — content shipped with the package.
 *
 * Aggregated here so `agent-factory` has a single import. Registered **after**
 * directory skills, i.e. at the lowest priority: a user or project skill of the
 * same name always wins.
 */

import { writeExtensionSkill } from "./write-extension.js";

import type { Skill } from "../types.js";

export const BUILTIN_SKILLS: readonly Skill[] = [writeExtensionSkill];
