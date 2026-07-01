import { tool } from "ai";
import { z } from "zod";

import { toolOutputBaseSchema } from "./util/types.js";

// ============================================================================
// Schemas
// ============================================================================

export const askUserOutputSchema = z.object({
  question: z.string().describe("The question that was asked."),
  answer: z.string().describe("The user's response."),
  hasOptions: z.boolean().describe("Whether predefined options were provided."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export type AskUserOutput = z.infer<typeof askUserOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Client-side tool: no execute function.
 * The AI SDK streams the tool call to the client, which renders a select list
 * and calls addToolOutput() with the user's answer.
 */
export const createAskUserTool = () => {
  return tool({
    description: `Ask the user a question and wait for their response. Use this tool when you need clarification or input from the user to proceed.

When to use:
- Requirements are ambiguous and you need the user to choose a direction
- You need confirmation on a significant decision before proceeding
- Multiple valid approaches exist and user preference matters
- You need specific information (e.g. a file path, config value, preference)

Do NOT use this tool for:
- Rhetorical questions or status updates (just say them in your response)
- Questions you could answer by reading the codebase
- Trivial confirmations that don't affect the outcome`,

    inputSchema: z.object({
      question: z.string().describe("The question to ask the user. Be specific and concise."),
      options: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of predefined options for the user to choose from. The user can still provide a free-form answer."
        ),
      multiSelect: z
        .boolean()
        .optional()
        .describe("If true, the user can select multiple options. Defaults to false (single select)."),
    }),

    outputSchema: askUserOutputSchema,

    // Only send the answer to the LLM — question is echoed in the input,
    // hasOptions/durationMs are metadata.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: AskUserOutput }) {
      return {
        type: "content" as const,
        value: [{ type: "text" as const, text: output.answer }],
      };
    },
  });
};
