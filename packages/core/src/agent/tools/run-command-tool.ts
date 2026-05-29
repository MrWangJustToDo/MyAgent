import { tool } from "ai";
import { z } from "zod";

import { maybeCacheOutput } from "./tool-output-cache.js";
import { runCommandOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/**
 * Creates a run-command tool using Vercel AI SDK.
 *
 * This tool executes a shell command in the sandbox environment.
 * Returns stdout, stderr, exit code, and execution duration.
 * Large outputs are cached to disk with a preview returned inline.
 *
 * Requires user approval before execution.
 */
export const createRunCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Executes a shell command in the sandbox environment. Returns stdout, stderr, exit code, and execution duration. Use this for running build commands, tests, scripts, or any shell operations. Large outputs are saved to disk — use read_file with the cachedOutputPath to read specific sections.",
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
      background: z
        .boolean()
        .optional()
        .describe("If true, run the command in the background and return immediately. Defaults to false."),
    }),
    outputSchema: runCommandOutputSchema,
    needsApproval: true,
    execute: async ({ command, cwd, env, timeout, background }, { toolCallId }) => {
      const result = await sandbox.runCommand(command, {
        cwd,
        env,
        timeout,
        background: background ?? false,
      });

      // Combine stdout+stderr for caching, cache each stream independently
      const stdoutResult = await maybeCacheOutput(sandbox, result.stdout, `${toolCallId}-stdout`);
      const stderrResult = await maybeCacheOutput(sandbox, result.stderr, `${toolCallId}-stderr`);

      const cachedOutputPath = stdoutResult.cachedOutputPath ?? stderrResult.cachedOutputPath ?? null;

      const truncationNote = cachedOutputPath ? " (large output cached to disk)" : "";

      return {
        command,
        stdout: stdoutResult.content,
        stderr: stderrResult.content,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        success: result.exitCode === 0,
        message:
          result.exitCode === 0
            ? `Command executed successfully in ${result.durationMs}ms${truncationNote}`
            : `Command failed with exit code ${result.exitCode}${truncationNote}`,
        cachedOutputPath,
      };
    },
  });
};
