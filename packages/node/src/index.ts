/**
 * @codent/node — Node.js runtime bindings for @codent/core.
 *
 * Provides:
 * - {@link createNodeEnv} — a {@link CoreEnv} implementation backed by Node.js APIs
 *
 * @example
 * ```typescript
 * import { registerCoreEnv } from "@codent/core";
 * import { createNodeEnv } from "@codent/node";
 *
 * registerCoreEnv(createNodeEnv({ rootPath: "/path/to/project" }));
 * ```
 */

import { destroyAllCommandJobs } from "@codent/core";
import { stdioTransport } from "@tanstack/ai-mcp/stdio";
import mime from "mime-types";
import { exec } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

import { createNodeIsolateDriver } from "./environment/isolate-driver.js";
import { resolveLocalEnvironmentMode } from "./environment/local.js";
import { createNativeFilesystem } from "./environment/native-fs.js";
import { runNativeCommand, startNativeCommand } from "./environment/native-run.js";
import { resetOsSandbox } from "./environment/os-sandbox.js";
import { locateTreeSitterGrammar } from "./lsp/grammar.js";
import { resolveCommandPath } from "./lsp/resolve-command.js";
import { createLspConnection as createNodeLspConnection } from "./lsp/transport.js";

import type { LocalEnvironmentConfig } from "./environment/local.js";
import type { CoreEnv, CoreEnvExecResult } from "@codent/core";
import type { ChildProcess } from "node:child_process";

// Re-export environment implementations
export * from "./environment";

// ============================================================================
// Image resizing degradation
// ============================================================================

/**
 * Set once the first resize failure is reported.
 *
 * `resizeImage` runs per oversized image, so an unguarded warning would repeat for
 * every read in a session. One line is enough to tell the reader the capability is
 * missing; the caller's own "image would overflow the budget" error carries the
 * per-image detail.
 */
let warnedResizeUnavailable = false;

/**
 * Explain why `sharp` could not resize, in terms the reader can act on.
 *
 * `sharp` ships as an `optionalDependency`, so a platform with no prebuilt binding
 * has the package omitted by npm rather than failing the install. That case has a
 * fix (install the matching `@img/sharp-*` or build it) and should read differently
 * from a decoder that rejected the specific bytes.
 */
function describeResizeFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Cannot find (package|module) 'sharp'/.test(message)) {
    return (
      `the optional dependency "sharp" is not installed. npm omits it on platforms ` +
      `without a prebuilt binding, so images over the token budget are rejected instead ` +
      `of downscaled.`
    );
  }
  return message;
}

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
 * LLM credentials are not part of CoreEnv — register a {@link import("@codent/core").ModelProvider}
 * separately via {@link import("@codent/core").registerModelProvider}.
 *
 * @example
 * ```typescript
 * import { registerCoreEnv, registerModelProvider, createDirectModelProvider } from "@codent/core";
 * import { createNodeEnv } from "@codent/node";
 *
 * registerCoreEnv(createNodeEnv({ rootPath: "/path/to/project" }));
 * registerModelProvider(createDirectModelProvider({ model, style, baseURL, apiKey }));
 * ```
 */
export function createNodeEnv(options: CreateNodeEnvOptions): CoreEnv {
  const { rootPath } = options;
  const useOsSandbox = resolveLocalEnvironmentMode(options) === "os";
  const homeAgents = path.join(os.homedir(), ".agents");
  const { filesystem, resolvePath } = createNativeFilesystem(rootPath, {
    // Allow reading user-global skills / extensions under ~/.agents
    extraReadRoots: [homeAgents],
  });

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

    commandExists: async (command: string): Promise<boolean> => {
      // Prefer a project-local install so a devDependency server is usable
      // without a global install (kept in sync with the LSP spawn path).
      if (resolveCommandPath(command, rootPath) !== command) return true;
      const probe = `command -v "${command}" >/dev/null 2>&1`;
      return new Promise<boolean>((resolve) => {
        exec(probe, (err) => {
          resolve(!err);
        });
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

    createLspConnection: (config) =>
      createNodeLspConnection({
        ...config,
        // Same resolution as commandExists, so the probed binary is the spawned one.
        command: resolveCommandPath(config.command, config.cwd ?? rootPath),
      }),
    locateTreeSitterGrammar,

    createIsolateDriver: createNodeIsolateDriver,

    resizeImage: async (buffer, { maxWidth = 1024, quality = 80 } = {}) => {
      try {
        const sharp = (await import("sharp")).default;
        const resized = await sharp(buffer)
          .resize({ width: maxWidth, withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();
        return new Uint8Array(resized);
      } catch (err) {
        // Degrade to `null` (the caller then rejects the image and reports its
        // size) — but say why. Returning `null` silently made the only
        // completely unobservable failure in this file: an oversized image was
        // refused with no hint that resizing was the missing capability, so a
        // platform without a `sharp` prebuild was indistinguishable from a
        // genuinely too-large image. Reported once: this is reached per image,
        // and a chatty warning per read would be worse than none.
        if (!warnedResizeUnavailable) {
          warnedResizeUnavailable = true;
          console.warn(`[node] image resizing unavailable (degrading): ${describeResizeFailure(err)}`);
        }
        return null;
      }
    },
  };
}
