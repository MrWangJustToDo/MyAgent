import { z } from "zod";

import { defineServerTool } from "./tanstack/define-tool.js";
import { commandJobRegistry } from "./util/command-job-registry.js";
import { getCommandOutputSchema } from "./util/types.js";

import type { GetCommandOutput } from "./util/types.js";

export const createGetCommandOutputTool = () => {
  return defineServerTool({
    name: "get_command_output",
    description:
      "Read incremental stdout/stderr and status for a background job started with run_command(run_in_background=true). " +
      "Each call returns output since the previous poll for that jobId.",
    inputSchema: z.object({
      jobId: z.string().describe("The jobId returned by a background run_command."),
    }),
    outputSchema: getCommandOutputSchema,
    needsApproval: false,
    execute: async ({ jobId }) => {
      const result = commandJobRegistry.poll(jobId);
      if (!result) {
        throw new Error(`Unknown background jobId: ${jobId}`);
      }
      return {
        ...result,
        cachedOutputPath: null,
      };
    },
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: GetCommandOutput }) {
      const parts = [
        `jobId: ${output.jobId}`,
        `status: ${output.status}`,
        `running: ${output.running}`,
        `exitCode: ${output.exitCode ?? "n/a"}`,
      ];
      if (output.stderr?.trim()) parts.push(`stderr:\n${output.stderr}`);
      if (output.stdout?.trim()) parts.push(`stdout:\n${output.stdout}`);
      else if (!output.stderr?.trim()) parts.push("(no new output)");
      return [{ type: "text" as const, content: parts.join("\n") }];
    },
  });
};
