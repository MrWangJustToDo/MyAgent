/**
 * Native shell command execution (with optional OS sandbox wrapping).
 */

import { ExecutionError } from "@my-agent/core";

import {
  annotateOsSandboxStderr,
  cleanupOsSandboxAfterCommand,
  ensureOsSandbox,
  wrapOsSandboxCommand,
} from "./os-sandbox.js";
import { spawnCommand } from "./shell.js";

import type { RunCommandOptions, CommandResult } from "@my-agent/core";

type ResolvePath = (inputPath: string) => string;

/**
 * Execute a command in the workspace with native bash, optionally OS-sandboxed.
 */
export async function runNativeCommand(
  rootPath: string,
  resolvePath: ResolvePath,
  command: string,
  options: RunCommandOptions | undefined,
  useOsSandbox: boolean
): Promise<CommandResult> {
  const startTime = Date.now();
  const cwd = options?.cwd ? resolvePath(options.cwd) : rootPath;
  const mergedEnv = options?.env ? { ...process.env, ...options.env } : process.env;

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  let osSandbox = false;
  if (useOsSandbox) {
    osSandbox = await ensureOsSandbox(rootPath);
  }

  try {
    let commandToRun = command;
    let useShellString = false;

    if (osSandbox) {
      commandToRun = await wrapOsSandboxCommand(command);
      useShellString = true;
    }

    const result = await spawnCommand(commandToRun, {
      cwd,
      env: mergedEnv as NodeJS.ProcessEnv,
      timeout: options?.timeout ? Math.ceil(options.timeout / 1000) : undefined,
      useShellString,
      onStdout: (chunk: string) => {
        stdoutChunks.push(chunk);
        options?.onStdout?.(chunk);
      },
      onStderr: (chunk: string) => {
        stderrChunks.push(chunk);
        options?.onStderr?.(chunk);
      },
    });

    const stdout = stdoutChunks.join("");
    let stderr = stderrChunks.join("");
    if (osSandbox) {
      stderr = annotateOsSandboxStderr(command, stderr);
    }

    return {
      stdout,
      stderr,
      exitCode: result.exitCode ?? 1,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const stdout = stdoutChunks.join("");
    let stderr = stderrChunks.join("");

    if (err instanceof Error) {
      if (err.message === "aborted") {
        throw new ExecutionError("aborted", "Command aborted");
      }
      if (err.message.startsWith("timeout:")) {
        throw new ExecutionError("timeout", `Command timed out after ${options?.timeout ?? 0}ms`);
      }
    }

    if (osSandbox) {
      stderr = annotateOsSandboxStderr(command, stderr || String(err));
    }

    return {
      stdout,
      stderr: stderr || String(err),
      exitCode: 1,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (osSandbox) {
      cleanupOsSandboxAfterCommand();
    }
  }
}
