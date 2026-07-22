import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { commandJobRegistry } from "./util/command-job-registry.js";
import { OutputAccumulator } from "./util/output-accumulator.js";
import { emitStreamingChunk } from "./util/streaming-callback.js";
import { maybeCacheOutput } from "./util/tool-output-cache.js";
import { runCommandOutputSchema } from "./util/types.js";

import type { RunCommandOutput } from "./util/types.js";

export const createRunCommandTool = () => {
  return defineServerTool({
    name: "run_command",
    description:
      "Executes a shell command in the workspace environment. Returns stdout, stderr, exit code, and execution duration. " +
      "Set run_in_background=true for long-lived processes (dev servers, watchers); then poll with get_command_output and stop with kill_command. " +
      "Large outputs are saved to disk — use read_file with the cachedOutputPath to read specific sections.",
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
        .int({ message: "timeout: must be an integer (milliseconds)" })
        .min(1000, { message: "timeout: must be >= 1000ms (use ms, not seconds)" })
        .optional()
        .describe("Timeout in milliseconds (foreground only). If the command takes longer, it will be terminated."),
      run_in_background: z
        .boolean()
        .optional()
        .describe(
          "When true, start the command in the background and return a jobId immediately. " +
            "Use get_command_output to read output/status and kill_command to stop it. " +
            "Prefer for long-lived servers (e.g. npm run dev)."
        ),
    }),
    outputSchema: runCommandOutputSchema,
    needsApproval: true,
    execute: async ({ command, cwd, env, timeout, run_in_background }, { toolCallId, agentId }) => {
      if (run_in_background) {
        const coreEnv = getEnv();
        if (!coreEnv.startCommand) {
          throw new Error(
            "Background commands are not supported in this environment. " +
              "Omit run_in_background or use a local/node or playground CoreEnv that implements startCommand."
          );
        }

        const job = commandJobRegistry.create(command);

        try {
          const handle = await coreEnv.startCommand(command, {
            cwd,
            env,
            onStdout: (chunk) => {
              commandJobRegistry.appendStdout(job.id, chunk);
            },
            onStderr: (chunk) => {
              commandJobRegistry.appendStderr(job.id, chunk);
            },
            onExit: (exitCode) => {
              commandJobRegistry.markExited(job.id, exitCode);
            },
          });
          commandJobRegistry.setKill(job.id, handle.kill);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          commandJobRegistry.markFailed(job.id, message);
          throw err;
        }

        return {
          command,
          stdout: "",
          stderr: "",
          exitCode: -1,
          durationMs: 0,
          success: true,
          jobId: job.id,
          status: "running" as const,
          runInBackground: true,
          cachedOutputPath: null,
        };
      }

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
          if (agentId) emitStreamingChunk(toolCallId, "stdout", chunk, { agentId });
        },
        onStderr: (chunk) => {
          stderrAccumulator.append(encoder.encode(chunk));
          if (agentId) emitStreamingChunk(toolCallId, "stderr", chunk, { agentId });
        },
      });

      stdoutAccumulator.finish();
      stderrAccumulator.finish();

      const stdoutSnapshot = stdoutAccumulator.snapshot();
      const stderrSnapshot = stderrAccumulator.snapshot();

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
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: RunCommandOutput }) {
      if (output.runInBackground && output.jobId) {
        return [
          {
            type: "text" as const,
            content:
              `Started background job ${output.jobId} for: ${output.command}\n` +
              `Status: ${output.status ?? "running"}\n` +
              `Use get_command_output with jobId="${output.jobId}" to read output/status. ` +
              `Use kill_command to stop the job when finished.`,
          },
        ];
      }
      return [
        { type: "text" as const, content: `Exit code: ${output.exitCode}` },
        ...(output.stderr?.trim?.() ? [{ type: "text" as const, content: `stderr:\n${output.stderr}` }] : []),
        { type: "text" as const, content: output.stdout },
      ];
    },
  });
};
