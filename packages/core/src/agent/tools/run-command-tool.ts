import { tool } from "ai";
import { z } from "zod";

import { getEnv } from "../../env.js";

import { OutputAccumulator } from "./util/output-accumulator.js";
import { emitStreamingChunk } from "./util/streaming-callback.js";
import { maybeCacheOutput } from "./util/tool-output-cache.js";
import { runCommandOutputSchema } from "./util/types.js";

import type { RunCommandOutput } from "./util/types.js";

/**
 * Creates a run-command tool using Vercel AI SDK.
 *
 * Requires user approval before execution.
 */
export const createRunCommandTool = () => {
  return tool({
    description:
      "Executes a shell command in the workspace environment. Returns stdout, stderr, exit code, and execution duration. Use this for running build commands, tests, scripts, or any shell operations. Large outputs are saved to disk — use read_file with the cachedOutputPath to read specific sections.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute."),
      cwd: z
        .string()
        .optional()
        .describe("The working directory to run the command in, relative to the project directory."),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Environment variables to set for the command execution."),
      timeout: z
        .number()
        .int()
        .min(1000)
        .optional()
        .describe("Timeout in milliseconds. If the command takes longer, it will be terminated."),
    }),
    outputSchema: runCommandOutputSchema,
    needsApproval: true,
    execute: async ({ command, cwd, env, timeout }, { toolCallId }) => {
      const stdoutAccumulator = new OutputAccumulator({
        tempFilePrefix: `${toolCallId}-stdout`,
      });
      const stderrAccumulator = new OutputAccumulator({
        tempFilePrefix: `${toolCallId}-stderr`,
      });

      const encoder = new TextEncoder();

      const result = await getEnv().runCommand(command, {
        cwd,
        env,
        timeout,
        onStdout: (chunk) => {
          stdoutAccumulator.append(encoder.encode(chunk));
          // Emit streaming chunk for UI updates
          emitStreamingChunk(toolCallId, "stdout", chunk);
        },
        onStderr: (chunk) => {
          stderrAccumulator.append(encoder.encode(chunk));
          // Emit streaming chunk for UI updates
          emitStreamingChunk(toolCallId, "stderr", chunk);
        },
      });

      stdoutAccumulator.finish();
      stderrAccumulator.finish();

      const stdoutSnapshot = stdoutAccumulator.snapshot();
      const stderrSnapshot = stderrAccumulator.snapshot();

      // Use the accumulated content (which may be truncated for display)
      // The maybeCacheOutput function will handle caching if needed
      const stdoutResult = await maybeCacheOutput(stdoutSnapshot.content, `${toolCallId}-stdout`);
      const stderrResult = await maybeCacheOutput(stderrSnapshot.content, `${toolCallId}-stderr`);

      const cachedOutputPath = stdoutResult.cachedOutputPath ?? stderrResult.cachedOutputPath ?? null;

      return {
        command,
        stdout: stdoutResult.content,
        stderr: stderrResult.content,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        success: result.exitCode === 0,
        cachedOutputPath,
      };
    },

    // Only send command output to the LLM — duration/success/cachedOutputPath
    // are execution metadata with no value for the model.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: RunCommandOutput }) {
      return {
        type: "content" as const,
        value: [
          { type: "text" as const, text: `Exit code: ${output.exitCode}` },
          ...(output.stderr.trim() ? [{ type: "text" as const, text: `stderr:\n${output.stderr}` }] : []),
          { type: "text" as const, text: output.stdout },
        ],
      };
    },
  });
};
