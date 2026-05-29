/**
 * Local environment implementation
 *
 * This environment runs commands and file operations on the local machine.
 * Supports two modes:
 * - sandbox: Uses just-bash for isolated execution (default)
 * - native: Uses real bash and Node.js fs for direct system access
 *
 * Key improvements over the original:
 * - Cross-platform shell detection (Linux, macOS, Windows/Git Bash)
 * - Process tree killing on abort/timeout with SIGTERM -> SIGKILL escalation
 * - Streaming stdout/stderr support via callbacks
 * - Structured ExecutionError with typed error codes
 */

import { justBash } from "@computesdk/just-bash";
import * as fs from "fs/promises";
import { ReadWriteFs } from "just-bash";
import * as path from "path";

import { spawnCommand } from "./shell.js";

import type { Environment, Sandbox, SandboxConfig } from "./types";

// ============================================================================
// Sandbox Mode (just-bash)
// ============================================================================

// Store provider instances per root path for proper isolation
const providerInstances = new Map<string, ReturnType<typeof justBash>>();

/**
 * Get or create a just-bash provider instance for a given root path
 */
function getProvider(rootPath: string) {
  let instance = providerInstances.get(rootPath);
  if (!instance) {
    // Use ReadWriteFs for actual file system access
    // The root path becomes the root of the virtual filesystem
    // So /foo/bar on disk becomes / in the virtual filesystem
    instance = justBash({
      fs: new ReadWriteFs({ root: rootPath }),
      cwd: "/", // Use "/" as cwd since rootPath is mounted at virtual "/"
    });
    providerInstances.set(rootPath, instance);
  }
  return instance;
}

/**
 * Cleanup a provider instance
 */
function cleanupProvider(rootPath: string) {
  providerInstances.delete(rootPath);
}

/**
 * Create a sandbox using just-bash (isolated mode)
 */
async function createJustBashSandbox(config: SandboxConfig): Promise<Sandbox> {
  const provider = getProvider(config.rootPath);

  // Create sandbox with "/" as directory since the real rootPath is mounted at virtual "/"
  const internalSandbox = await provider.sandbox.create({
    directory: config.cwd ?? "/",
  });

  // Get the native just-bash instance which has full IFileSystem support
  // including readFileBuffer() and stat()
  const nativeInstance = internalSandbox.getInstance();
  const bashFs = nativeInstance.bash.fs;

  // Wrap the internal sandbox to match our Sandbox interface
  const sandbox: Sandbox = {
    sandboxId: internalSandbox.sandboxId,
    provider: "local-sandbox",

    filesystem: {
      readFile: (filePath: string) => internalSandbox.filesystem.readFile(filePath),

      readFileBuffer: async (filePath: string) => {
        // Use just-bash's native readFileBuffer which returns Uint8Array
        const uint8Array = await bashFs.readFileBuffer(filePath);
        // Convert Uint8Array to Buffer for Node.js compatibility
        return Buffer.from(uint8Array);
      },

      stat: async (filePath: string) => {
        // Use just-bash's native stat
        const fsStat = await bashFs.stat(filePath);
        return {
          size: fsStat.size,
          isDirectory: fsStat.isDirectory,
          isFile: fsStat.isFile,
          mtime: fsStat.mtime,
        };
      },

      writeFile: (filePath: string, content: string) => internalSandbox.filesystem.writeFile(filePath, content),

      readdir: async (dirPath: string) => {
        const entries = await internalSandbox.filesystem.readdir(dirPath);
        return entries.map((entry) => ({
          name: entry.name,
          type: entry.type as "file" | "directory",
          size: "size" in entry ? (entry.size as number | undefined) : undefined,
          modified: "modified" in entry ? (entry.modified as Date | undefined) : undefined,
        }));
      },

      mkdir: (dirPath: string) => internalSandbox.filesystem.mkdir(dirPath),
      exists: (filePath: string) => internalSandbox.filesystem.exists(filePath),
      remove: (filePath: string) => internalSandbox.filesystem.remove(filePath),
    },

    runCommand: async (command: string, options) => {
      const startTime = Date.now();

      try {
        const result = await internalSandbox.runCommand(command, {
          cwd: options?.cwd,
          env: options?.env,
          timeout: options?.timeout,
          background: options?.background,
        });

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        // just-bash may throw on abort/timeout; normalize to CommandResult
        return {
          stdout: (err as { stdout?: string }).stdout ?? "",
          stderr: (err as { stderr?: string }).stderr ?? String(err),
          exitCode: (err as { exitCode?: number }).exitCode ?? 1,
          durationMs: Date.now() - startTime,
        };
      }
    },

    destroy: async () => {
      await internalSandbox.destroy();
      cleanupProvider(config.rootPath);
    },
  };

  return sandbox;
}

// ============================================================================
// Native Mode (real bash + Node.js fs)
// ============================================================================

let nativeSandboxCounter = 0;

/**
 * Create a sandbox using native bash and Node.js fs (direct system access).
 *
 * Uses `spawnCommand` from shell.ts for robust process management:
 * - Cross-platform shell detection
 * - Process tree killing on abort/timeout
 * - Streaming stdout/stderr via callbacks
 */
async function createNativeSandbox(config: SandboxConfig): Promise<Sandbox> {
  const rootPath = config.rootPath;
  const sandboxId = `native-${++nativeSandboxCounter}-${Date.now()}`;

  /**
   * Resolve a path relative to the sandbox root.
   * If the path is already absolute and within rootPath, use it directly.
   */
  const resolvePath = (inputPath: string): string => {
    if (inputPath.startsWith(rootPath)) {
      return inputPath;
    }
    const normalized = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
    return path.join(rootPath, normalized);
  };

  const sandbox: Sandbox = {
    sandboxId,
    provider: "local-native",

    filesystem: {
      readFile: async (filePath: string) => {
        const fullPath = resolvePath(filePath);
        return fs.readFile(fullPath, "utf-8");
      },

      readFileBuffer: async (filePath: string) => {
        const fullPath = resolvePath(filePath);
        return fs.readFile(fullPath);
      },

      stat: async (filePath: string) => {
        const fullPath = resolvePath(filePath);
        const stats = await fs.stat(fullPath);
        return {
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          mtime: stats.mtime,
        };
      },

      writeFile: async (filePath: string, content: string) => {
        const fullPath = resolvePath(filePath);
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
      },

      readdir: async (dirPath: string) => {
        const fullPath = resolvePath(dirPath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const result: Array<{ name: string; type: "file" | "directory"; size?: number; modified?: Date }> = [];

        for (const entry of entries) {
          const entryPath = path.join(fullPath, entry.name);
          let size: number | undefined;
          let modified: Date | undefined;

          try {
            const stats = await fs.stat(entryPath);
            size = stats.size;
            modified = stats.mtime;
          } catch {
            // Ignore stat errors for individual entries
          }

          result.push({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            size,
            modified,
          });
        }

        return result;
      },

      mkdir: async (dirPath: string) => {
        const fullPath = resolvePath(dirPath);
        await fs.mkdir(fullPath, { recursive: true });
      },

      exists: async (filePath: string) => {
        const fullPath = resolvePath(filePath);
        try {
          await fs.access(fullPath);
          return true;
        } catch {
          return false;
        }
      },

      remove: async (filePath: string) => {
        const fullPath = resolvePath(filePath);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
        } else {
          await fs.unlink(fullPath);
        }
      },

      appendFile: async (filePath: string, content: string) => {
        const fullPath = resolvePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.appendFile(fullPath, content, "utf-8");
      },

      copy: async (sourcePath: string, targetPath: string) => {
        const fullSourcePath = resolvePath(sourcePath);
        const fullTargetPath = resolvePath(targetPath);
        await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
        await fs.copyFile(fullSourcePath, fullTargetPath, fs.constants.COPYFILE_EXCL);
      },
    },

    runCommand: async (command: string, options) => {
      const startTime = Date.now();
      const cwd = options?.cwd ? resolvePath(options.cwd) : rootPath;

      // Merge process.env with per-command env (per-command takes priority)
      const mergedEnv = options?.env ? { ...process.env, ...options.env } : process.env;

      // Accumulate stdout/stderr from streaming callbacks
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      try {
        const result = await spawnCommand(command, {
          cwd,
          env: mergedEnv as NodeJS.ProcessEnv,
          timeout: options?.timeout ? Math.ceil(options.timeout / 1000) : undefined,
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
        const stderr = stderrChunks.join("");

        return {
          stdout,
          stderr,
          exitCode: result.exitCode ?? 1,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        const stdout = stdoutChunks.join("");
        const stderr = stderrChunks.join("");

        if (err instanceof Error) {
          if (err.message === "aborted") {
            throw Object.assign(new Error("Command aborted"), {
              code: "aborted" as const,
              stdout,
              stderr,
              exitCode: 1,
              durationMs: Date.now() - startTime,
            });
          }
          if (err.message.startsWith("timeout:")) {
            throw Object.assign(new Error(`Command timed out after ${options?.timeout ?? 0}ms`), {
              code: "timeout" as const,
              stdout,
              stderr,
              exitCode: 1,
              durationMs: Date.now() - startTime,
            });
          }
        }

        // Generic error fallback
        return {
          stdout,
          stderr: stderr || String(err),
          exitCode: 1,
          durationMs: Date.now() - startTime,
        };
      }
    },

    destroy: async () => {
      // Native sandbox has no cleanup needed
    },
  };

  return sandbox;
}

// ============================================================================
// Environment Factory
// ============================================================================

/**
 * Local environment configuration
 */
export interface LocalEnvironmentConfig {
  /**
   * Whether to use just-bash sandbox mode.
   * - true (default): Use just-bash for isolated execution
   * - false: Use native bash and fs for direct system access
   */
  sandbox?: boolean;
}

/**
 * Create a local environment with the specified configuration
 *
 * @param config - Local environment configuration
 * @returns Environment instance
 *
 * @example
 * ```typescript
 * // Use just-bash sandbox mode (default, isolated)
 * const sandboxEnv = createLocalEnvironment({ sandbox: true });
 *
 * // Use native mode (direct system access)
 * const nativeEnv = createLocalEnvironment({ sandbox: false });
 *
 * const sandbox = await nativeEnv.createSandbox({ rootPath: '/path/to/project' });
 * const result = await sandbox.runCommand('npm install');
 * ```
 */
export function createLocalEnvironment(config: LocalEnvironmentConfig = {}): Environment {
  const useSandbox = config.sandbox !== false; // Default to true

  return {
    name: useSandbox ? "local-sandbox" : "local-native",

    async createSandbox(sandboxConfig: SandboxConfig): Promise<Sandbox> {
      if (useSandbox) {
        return createJustBashSandbox(sandboxConfig);
      } else {
        return createNativeSandbox(sandboxConfig);
      }
    },

    async getSandboxById(sandboxId: string): Promise<Sandbox | undefined> {
      if (useSandbox) {
        // For just-bash mode, search through provider instances
        for (const [rootPath, provider] of providerInstances.entries()) {
          const internalSandbox = await provider.sandbox.getById(sandboxId);
          if (internalSandbox) {
            // Get the native just-bash instance
            const nativeInstance = internalSandbox.getInstance();
            const bashFs = nativeInstance.bash.fs;

            // Re-wrap the sandbox
            const sandbox: Sandbox = {
              sandboxId: internalSandbox.sandboxId,
              provider: "local-sandbox",

              filesystem: {
                readFile: (filePath: string) => internalSandbox.filesystem.readFile(filePath),

                readFileBuffer: async (filePath: string) => {
                  const uint8Array = await bashFs.readFileBuffer(filePath);
                  return Buffer.from(uint8Array);
                },

                stat: async (filePath: string) => {
                  const fsStat = await bashFs.stat(filePath);
                  return {
                    size: fsStat.size,
                    isDirectory: fsStat.isDirectory,
                    isFile: fsStat.isFile,
                    mtime: fsStat.mtime,
                  };
                },

                writeFile: (filePath: string, content: string) =>
                  internalSandbox.filesystem.writeFile(filePath, content),

                readdir: async (dirPath: string) => {
                  const entries = await internalSandbox.filesystem.readdir(dirPath);
                  return entries.map((entry) => ({
                    name: entry.name,
                    type: entry.type as "file" | "directory",
                    size: "size" in entry ? (entry.size as number | undefined) : undefined,
                    modified: "modified" in entry ? (entry.modified as Date | undefined) : undefined,
                  }));
                },

                mkdir: (dirPath: string) => internalSandbox.filesystem.mkdir(dirPath),
                exists: (filePath: string) => internalSandbox.filesystem.exists(filePath),
                remove: (filePath: string) => internalSandbox.filesystem.remove(filePath),
              },

              runCommand: async (command: string, options) => {
                const startTime = Date.now();
                try {
                  const result = await internalSandbox.runCommand(command, {
                    cwd: options?.cwd,
                    env: options?.env,
                    timeout: options?.timeout,
                    background: options?.background,
                  });
                  return {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: Date.now() - startTime,
                  };
                } catch (err) {
                  return {
                    stdout: (err as { stdout?: string }).stdout ?? "",
                    stderr: (err as { stderr?: string }).stderr ?? String(err),
                    exitCode: (err as { exitCode?: number }).exitCode ?? 1,
                    durationMs: Date.now() - startTime,
                  };
                }
              },

              destroy: async () => {
                await internalSandbox.destroy();
                cleanupProvider(rootPath);
              },
            };
            return sandbox;
          }
        }
      }
      // Native sandboxes are not persistent, so we can't retrieve them by ID
      return undefined;
    },
  };
}

/**
 * Default local environment using just-bash sandbox mode
 */
export const localEnvironment: Environment = createLocalEnvironment({ sandbox: true });

/**
 * Native local environment using real bash and Node.js fs
 */
export const nativeEnvironment: Environment = createLocalEnvironment({ sandbox: false });
