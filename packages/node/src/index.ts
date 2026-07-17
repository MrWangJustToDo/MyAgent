/**
 * @my-agent/node — Node.js runtime bindings for @my-agent/core.
 *
 * Provides:
 * - {@link createNodeEnv} — a {@link CoreEnv} implementation backed by Node.js APIs
 *
 * @example
 * ```typescript
 * import { registerCoreEnv } from "@my-agent/core";
 * import { createNodeEnv } from "@my-agent/node";
 *
 * registerCoreEnv(createNodeEnv({ rootPath: "/path/to/project" }));
 * ```
 */

import { stdioTransport } from "@tanstack/ai-mcp/stdio";
import mime from "mime-types";
import { exec } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

import { destroyAllCommandJobs } from "@my-agent/core";

import { resolveLocalEnvironmentMode } from "./environment/local.js";
import { createNativeFilesystem } from "./environment/native-fs.js";
import { runNativeCommand, startNativeCommand } from "./environment/native-run.js";
import { resetOsSandbox } from "./environment/os-sandbox.js";

import type { LocalEnvironmentConfig } from "./environment/local.js";
import type { CoreEnv, CoreEnvExecResult } from "@my-agent/core";
import type { ChildProcess } from "node:child_process";

// Re-export environment implementations
export * from "./environment";

// ============================================================================
// createNodeEnv
// ============================================================================

export interface CreateNodeEnvOptions extends LocalEnvironmentConfig {
  /** Workspace root path for agent file operations */
  rootPath: string;
}

/**
 * Create a {@link CoreEnv} implementation backed by Node.js built-in APIs.
 *
 * @example
 * ```typescript
 * import { registerCoreEnv } from "@my-agent/core";
 * import { createNodeEnv } from "@my-agent/node";
 *
 * registerCoreEnv(createNodeEnv({ rootPath: "/path/to/project" }));
 * ```
 */
export function createNodeEnv(options: CreateNodeEnvOptions): CoreEnv {
  const { rootPath } = options;
  const useOsSandbox = resolveLocalEnvironmentMode(options) === "os";
  const { filesystem, resolvePath } = createNativeFilesystem(rootPath);

  return {
    rootPath,

    path: {
      join: path.join,
      dirname: path.dirname,
      basename: path.basename,
      extname: path.extname,
      resolve: path.resolve,
      normalize: path.normalize,
      isAbsolute: path.isAbsolute,
      getSep: () => path.sep,
      parse: path.parse,
    },

    getPlatform: async () => process.platform,
    getArch: async () => process.arch,
    getEnv: async () => process.env as Record<string, string | undefined>,
    homedir: async () => os.homedir(),

    byteLength: (str: string, encoding?: string) => Buffer.byteLength(str, encoding as BufferEncoding),

    base64Encode: (data: Uint8Array) => Buffer.from(data).toString("base64"),

    base64Decode: (str: string) => new Uint8Array(Buffer.from(str, "base64")),

    fs: filesystem,

    runCommand: (command, cmdOptions) => runNativeCommand(rootPath, resolvePath, command, cmdOptions, useOsSandbox),

    startCommand: (command, cmdOptions) => startNativeCommand(rootPath, resolvePath, command, cmdOptions, useOsSandbox),

    exec: (command: string, execOptions?) => {
      return new Promise<CoreEnvExecResult>((resolve) => {
        const child = exec(
          command,
          {
            cwd: execOptions?.cwd,
            timeout: execOptions?.timeout,
            env: execOptions?.env ? { ...process.env, ...execOptions.env } : process.env,
          },
          (err, stdout, stderr) => {
            if (err) {
              resolve({
                stdout: typeof stdout === "string" ? stdout : "",
                stderr: typeof stderr === "string" ? stderr : "",
                code: typeof err.code === "number" ? err.code : 1,
              });
              return;
            }
            resolve({
              stdout: typeof stdout === "string" ? stdout : "",
              stderr: typeof stderr === "string" ? stderr : "",
              code: 0,
            });
          }
        );
        child.on("error", () => {});
      });
    },

    destroy: async () => {
      await destroyAllCommandJobs();
      if (useOsSandbox) {
        await resetOsSandbox();
      }
    },

    fetch: globalThis.fetch,

    getMimeType: async (filePath: string) => mime.lookup(filePath),

    createMCPStdioTransport: (config) => {
      return stdioTransport({
        command: config.command,
        args: config.args,
        env: config.env,
      });
    },

    getMCPTransportProcess: (transport) => {
      const child =
        (transport as unknown as { _process?: ChildProcess; process?: ChildProcess })._process ??
        (transport as unknown as { process?: ChildProcess }).process;
      if (!child) return undefined;
      return {
        killed: child.killed,
        kill: (signal?: string) => child.kill(signal as NodeJS.Signals),
      };
    },
  };
}
