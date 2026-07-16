import { ExecutionError } from "@my-agent/core";

import { toWebContainerSpawnCwd } from "./workspace-path.js";

import type { CommandResult, CoreEnvExecOptions, CoreEnvExecResult, RunCommandOptions } from "@my-agent/core";
import type { WebContainer } from "@webcontainer/api";

/** WebContainer / jsh often emits CRLF; keep LF for Ink + consistent tool output. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function collectProcessOutput(
  wc: WebContainer,
  command: string,
  cwd: string,
  env: Record<string, string> | undefined,
  options: { onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void; timeout?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const process = await wc.spawn("jsh", ["-c", command], {
    cwd,
    env,
  });

  const stdoutChunks: string[] = [];
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let carry = "";

  const outputDone = process.output.pipeTo(
    new WritableStream<string>({
      write(chunk) {
        // Avoid splitting CRLF across chunks when notifying the UI stream.
        const combined = carry + chunk;
        if (combined.endsWith("\r")) {
          carry = "\r";
          const body = combined.slice(0, -1);
          if (body) {
            stdoutChunks.push(body);
            options.onStdout?.(normalizeNewlines(body));
          }
          return;
        }
        carry = "";
        stdoutChunks.push(combined);
        options.onStdout?.(normalizeNewlines(combined));
      },
    })
  );

  if (options.timeout && options.timeout > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        process.kill();
      } catch {
        // ignore
      }
    }, options.timeout);
  }

  try {
    const [exitCode] = await Promise.all([process.exit, outputDone]);
    if (timedOut) {
      throw new ExecutionError("timeout", `Command timed out after ${options.timeout}ms`);
    }
    if (carry) {
      stdoutChunks.push(carry);
      options.onStdout?.(normalizeNewlines(carry));
    }
    return {
      stdout: normalizeNewlines(stdoutChunks.join("")),
      stderr: "",
      exitCode: exitCode ?? 1,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function runWebContainerCommand(
  wc: WebContainer,
  rootPath: string,
  command: string,
  options?: RunCommandOptions
): Promise<CommandResult> {
  const start = Date.now();
  const cwd = toWebContainerSpawnCwd(rootPath, options?.cwd);
  try {
    const result = await collectProcessOutput(wc, command, cwd, options?.env, {
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
      timeout: options?.timeout,
    });
    return {
      ...result,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (err instanceof ExecutionError) throw err;
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }
}

export async function execWebContainerCommand(
  wc: WebContainer,
  rootPath: string,
  command: string,
  options?: CoreEnvExecOptions
): Promise<CoreEnvExecResult> {
  const cwd = toWebContainerSpawnCwd(rootPath, options?.cwd);
  const env = options?.env
    ? Object.fromEntries(Object.entries(options.env).filter((entry): entry is [string, string] => entry[1] != null))
    : undefined;

  try {
    const result = await collectProcessOutput(wc, command, cwd, env, { timeout: options?.timeout });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.exitCode,
    };
  } catch (err) {
    if (err instanceof ExecutionError) throw err;
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      code: 1,
    };
  }
}
