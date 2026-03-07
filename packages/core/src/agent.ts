import { generateText, tool } from "xsai";
import { z } from "zod";

import { DEFAULT_OLLAMA_API_URL } from "./types.js";

import type { ChatMessage } from "./schemas.js";
import type { Tool } from "xsai";

export interface AgentOptions {
  model: string;
  baseURL?: string;
  systemPrompt?: string;
  tools?: Tool[];
  maxSteps?: number;
}

export interface AgentResult {
  text: string;
  steps: number;
}

/**
 * Create an agent that can use tools to accomplish tasks
 * Uses xsai's native tool calling with maxSteps
 */
export const createAgent = ({
  model,
  baseURL = DEFAULT_OLLAMA_API_URL,
  systemPrompt,
  tools = [],
  maxSteps = 10,
}: AgentOptions) => {
  return {
    run: async (task: string): Promise<AgentResult> => {
      const messages: ChatMessage[] = [];

      if (systemPrompt) {
        messages.push({
          role: "system",
          content: systemPrompt,
        });
      }

      messages.push({
        role: "user",
        content: task,
      });

      const response = await generateText({
        baseURL,
        messages,
        model,
        tools,
        maxSteps,
      });

      return {
        text: response.text ?? "",
        steps: response.steps?.length ?? 1,
      };
    },
  };
};

/**
 * Built-in tool definitions that can be used with agents
 * Use createBuiltInTools() to get the actual Tool objects
 */
export const createBuiltInTools = async () => ({
  /**
   * Tool for getting current date/time
   */
  dateTime: await tool({
    name: "get_datetime",
    description: "Get the current date and time",
    parameters: z.object({
      timezone: z.string().describe("Timezone (e.g., 'UTC', 'America/New_York')").optional(),
    }),
    execute: async (params) => {
      const date = new Date();
      const timezone = params.timezone || "UTC";
      try {
        return JSON.stringify({
          datetime: date.toLocaleString("en-US", { timeZone: timezone }),
          timezone,
        });
      } catch {
        return JSON.stringify({
          datetime: date.toISOString(),
          timezone: "UTC",
        });
      }
    },
  }),

  /**
   * Tool for basic math calculations
   */
  calculator: await tool({
    name: "calculator",
    description: "Perform basic math calculations",
    parameters: z.object({
      expression: z.string().describe("Math expression to evaluate (e.g., '2 + 2', '10 * 5')"),
    }),
    execute: async (params) => {
      const { expression } = params;
      // Simple safe evaluation for basic math
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      try {
        const result = Function(`"use strict"; return (${sanitized})`)();
        return JSON.stringify({ expression, result });
      } catch {
        return JSON.stringify({ expression, error: "Invalid expression" });
      }
    },
  }),
});
