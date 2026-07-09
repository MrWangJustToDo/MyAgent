import { z } from "zod";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

import type { SkillRegistry } from "../skills/skill-registry.js";

export interface LoadSkillToolConfig {
  skillRegistry: SkillRegistry;
}

export const loadSkillOutputSchema = z.object({
  name: z.string().describe("Skill name"),
  content: z.string().describe("Skill content wrapped in <skill> tags"),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;

export const createLoadSkillTool = ({ skillRegistry }: LoadSkillToolConfig) => {
  return defineServerTool({
    name: "load_skill",
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
          throw new Error(`Unknown skill '${name}'. ${availableList}`);
        }

        const content = `<skill name="${name}">\n${skill.body}\n</skill>`;

        return {
          name,
          content,
        };
      });
    },
    // Only send content to the LLM — name is echoed in the input,
    // durationMs is metadata.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: z.infer<typeof loadSkillOutputSchema> }) {
      return [{ type: "text" as const, content: output.content }];
    },
  });
};
