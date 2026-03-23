/**
 * List Skills Tool - Discover available skills for on-demand loading.
 *
 * This tool allows the agent to discover what skills are available
 * before loading them. Part of the two-layer skill injection pattern:
 * - Layer 1: list_skills for discovery (this tool)
 * - Layer 2: load_skill for full content
 *
 * @example
 * ```typescript
 * const listSkillsTool = createListSkillsTool({ skillRegistry });
 * // Agent can call: list_skills({})
 * // Returns formatted list of skill names and descriptions
 * ```
 */

import { tool } from "ai";
import { z } from "zod";

import { withDuration } from "./helpers.js";

import type { SkillRegistry } from "../skills/skill-registry.js";

// ============================================================================
// Types
// ============================================================================

export interface ListSkillsToolConfig {
  /** Skill registry to query */
  skillRegistry: SkillRegistry;
}

// ============================================================================
// Output Schema
// ============================================================================

export const listSkillsOutputSchema = z.object({
  /** List of available skills */
  skills: z.array(
    z.object({
      name: z.string().describe("Skill identifier"),
      description: z.string().describe("Brief description of the skill"),
    })
  ),
  /** Total number of skills */
  count: z.number().describe("Number of available skills"),
  /** Formatted output message */
  message: z.string().describe("Formatted list for display"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
});

export type ListSkillsOutput = z.infer<typeof listSkillsOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates the list_skills tool for skill discovery.
 *
 * @param config - Tool configuration with skill registry
 * @returns Vercel AI SDK tool
 */
export const createListSkillsTool = ({ skillRegistry }: ListSkillsToolConfig) => {
  return tool({
    description: `List available skills that can be loaded on-demand.

Use this tool to discover what specialized knowledge is available before loading it.
Each skill contains domain-specific instructions or workflows.

After discovering skills, use load_skill to load the full content of a specific skill.`,

    inputSchema: z.object({}),

    outputSchema: listSkillsOutputSchema,

    execute: async () => {
      return withDuration(async () => {
        const skills = skillRegistry.list();

        if (skills.length === 0) {
          return {
            skills: [],
            count: 0,
            message: "No skills available.",
          };
        }

        // Format output message
        const lines = ["Available skills:"];
        for (const skill of skills) {
          lines.push(`  - ${skill.name}: ${skill.description}`);
        }
        const message = lines.join("\n");

        return {
          skills,
          count: skills.length,
          message,
        };
      });
    },
  });
};
