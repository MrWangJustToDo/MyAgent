import { tool } from "ai";
import { z } from "zod";

import type { Sandbox } from "../../types";

export const createRunCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    title: "run-command-tool",
    description:
      "Executes a shell command in the sandbox environment. Returns stdout, stderr, exit code, and execution duration. Use this for running build commands, tests, scripts, or any shell operations.",
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
    inputExamples: [{ input: { command: "npm run build", cwd: "/project" } }],
    needsApproval: true,
    outputSchema: z.object({
      command: z.string().describe("The command that was executed."),
      stdout: z.string().describe("Standard output."),
      stderr: z.string().describe("Standard error."),
      exitCode: z.number().describe("Exit code."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
      success: z.boolean().describe("Whether the command succeeded."),
      message: z.string().describe("A message describing the result."),
    }),
    execute: async ({ command, cwd, env, timeout, background }, { abortSignal }) => {
      if (abortSignal?.aborted) {
        throw new Error(abortSignal.reason as string);
      }

      const result = await sandbox.runCommand(command, {
        cwd,
        env,
        timeout,
        background: background ?? false,
      });

      return {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        success: result.exitCode === 0,
        message:
          result.exitCode === 0
            ? `Command executed successfully in ${result.durationMs}ms`
            : `Command failed with exit code ${result.exitCode}`,
      };
    },
  });
};
