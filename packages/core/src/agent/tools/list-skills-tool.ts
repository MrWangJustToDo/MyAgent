import { z } from "zod";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

import type { SkillRegistry } from "../skills/skill-registry.js";

export interface ListSkillsToolConfig {
  skillRegistry: SkillRegistry;
}

export const listSkillsOutputSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string().describe("Skill identifier"),
      description: z.string().describe("Brief description of the skill"),
    })
  ),
  count: z.number().describe("Number of available skills"),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export type ListSkillsOutput = z.infer<typeof listSkillsOutputSchema>;

export const createListSkillsTool = ({ skillRegistry }: ListSkillsToolConfig) => {
  return defineServerTool({
    name: "list_skills",
    description: `List available skills (name + brief description).

Prefer the <skills> index already in the system prompt. Call this only to refresh the list.
Then use load_skill to load the full content of a specific skill.`,
    inputSchema: z.object({}),
    outputSchema: listSkillsOutputSchema,
    execute: async () => {
      return withDuration(async () => {
        const skills = skillRegistry.list();

        if (skills.length === 0) {
          return {
            skills: [],
            count: 0,
          };
        }

        return {
          skills,
          count: skills.length,
        };
      });
    },
    // Only send skills to the LLM — count is skills.length, durationMs is metadata.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: z.infer<typeof listSkillsOutputSchema> }) {
      const lines = output.skills?.map?.((s) => `- ${s.name}: ${s.description}`);
      return [{ type: "text" as const, content: `Available skills:\n${lines?.join("\n")}` }];
    },
  });
};
