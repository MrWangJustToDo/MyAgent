/**
 * Load Skill Tool - Load full skill content on-demand.
 *
 * This tool allows the agent to load the full content of a skill
 * after discovering it via list_skills. Part of the two-layer pattern:
 * - Layer 1: list_skills for discovery
 * - Layer 2: load_skill for full content (this tool)
 *
 * Skill content is returned wrapped in <skill name="..."> tags
 * for clear context boundaries.
 *
 * @example
 * ```typescript
 * const loadSkillTool = createLoadSkillTool({ skillRegistry });
 * // Agent can call: load_skill({ name: "git-workflow" })
 * // Returns: <skill name="git-workflow">...</skill>
 * ```
 */

import { tool } from "ai";
import { z } from "zod";

import { withDuration } from "./helpers.js";

import type { SkillRegistry } from "../skills/skill-registry.js";

// ============================================================================
// Types
// ============================================================================

export interface LoadSkillToolConfig {
  /** Skill registry to query */
  skillRegistry: SkillRegistry;
}

// ============================================================================
// Output Schema
// ============================================================================

export const loadSkillOutputSchema = z.object({
  /** Whether the skill was found */
  found: z.boolean().describe("Whether the skill was found"),
  /** Skill name */
  name: z.string().describe("Skill name"),
  /** Full skill content wrapped in <skill> tags, or error message */
  content: z.string().describe("Skill content or error message"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
});

export type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates the load_skill tool for loading full skill content.
 *
 * @param config - Tool configuration with skill registry
 * @returns Vercel AI SDK tool
 */
export const createLoadSkillTool = ({ skillRegistry }: LoadSkillToolConfig) => {
  return tool({
    description: `Load the full content of a skill by name.

Use this after list_skills to load specific domain knowledge.
The skill content will be returned wrapped in <skill name="..."> tags.

Skills contain specialized instructions, workflows, or domain expertise
that help you complete specific types of tasks.`,

    inputSchema: z.object({
      name: z.string().describe("The name of the skill to load"),
    }),

    outputSchema: loadSkillOutputSchema,

    execute: async ({ name }) => {
      return withDuration(async () => {
        const skill = skillRegistry.get(name);

        if (!skill) {
          const available = skillRegistry.names();
          const availableList =
            available.length > 0 ? `Available skills: ${available.join(", ")}` : "No skills are currently loaded.";

          return {
            found: false,
            name,
            content: `Error: Unknown skill '${name}'. ${availableList}`,
          };
        }

        // Wrap content in <skill> tags for clear context boundary
        const content = `<skill name="${name}">\n${skill.body}\n</skill>`;

        return {
          found: true,
          name,
          content,
        };
      });
    },
  });
};
