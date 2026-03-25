/**
 * Local environment implementation
 *
 * This environment runs commands and file operations on the local machine.
 * Supports two modes:
 * - sandbox: Uses just-bash for isolated execution (default)
 * - native: Uses real bash and Node.js fs for direct system access
 */

import { justBash } from "@computesdk/just-bash";
import { exec } from "child_process";
import * as fs from "fs/promises";
import { ReadWriteFs } from "just-bash";
import * as path from "path";
import { promisify } from "util";

import type { Environment, FileEntry, Sandbox, SandboxConfig } from "./types";

const execAsync = promisify(exec);

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

  // Wrap the internal sandbox to match our Sandbox interface
  const sandbox: Sandbox = {
    sandboxId: internalSandbox.sandboxId,
    provider: "local-sandbox",

    filesystem: {
      readFile: (filePath: string) => internalSandbox.filesystem.readFile(filePath),
      writeFile: (filePath: string, content: string) => internalSandbox.filesystem.writeFile(filePath, content),
      readdir: async (dirPath: string) => {
        const entries = await internalSandbox.filesystem.readdir(dirPath);
        return entries.map((entry) => ({
          name: entry.name,
          type: entry.type as "file" | "directory",
          // Pass through optional fields if available from the provider
          size: "size" in entry ? (entry.size as number | undefined) : undefined,
          modified: "modified" in entry ? (entry.modified as Date | undefined) : undefined,
        }));
      },
      mkdir: (dirPath: string) => internalSandbox.filesystem.mkdir(dirPath),
      exists: (filePath: string) => internalSandbox.filesystem.exists(filePath),
      remove: (filePath: string) => internalSandbox.filesystem.remove(filePath),
    },

    runCommand: async (command: string, options) => {
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
        durationMs: result.durationMs,
      };
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
 * Create a sandbox using native bash and Node.js fs (direct system access)
 */
async function createNativeSandbox(config: SandboxConfig): Promise<Sandbox> {
  const rootPath = config.rootPath;
  const sandboxId = `native-${++nativeSandboxCounter}-${Date.now()}`;

  /**
   * Resolve a path relative to the sandbox root
   */
  const resolvePath = (relativePath: string): string => {
    // Handle absolute paths within the sandbox
    const normalized = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
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

      writeFile: async (filePath: string, content: string) => {
        const fullPath = resolvePath(filePath);
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
      },

      readdir: async (dirPath: string): Promise<FileEntry[]> => {
        const fullPath = resolvePath(dirPath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const result: FileEntry[] = [];

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
    },

    runCommand: async (command: string, options) => {
      const startTime = Date.now();
      const cwd = options?.cwd ? resolvePath(options.cwd) : rootPath;

      // Merge process.env with per-command env (per-command takes priority)
      const mergedEnv = options?.env ? { ...process.env, ...options.env } : process.env;

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          env: mergedEnv,
          timeout: options?.timeout,
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        });

        return {
          stdout,
          stderr,
          exitCode: 0,
          durationMs: Date.now() - startTime,
        };
      } catch (error: unknown) {
        const execError = error as {
          stdout?: string;
          stderr?: string;
          code?: number;
          killed?: boolean;
          signal?: string;
        };

        return {
          stdout: execError.stdout ?? "",
          stderr: execError.stderr ?? String(error),
          exitCode: execError.code ?? 1,
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
            // Re-wrap the sandbox
            const sandbox: Sandbox = {
              sandboxId: internalSandbox.sandboxId,
              provider: "local-sandbox",

              filesystem: {
                readFile: (filePath: string) => internalSandbox.filesystem.readFile(filePath),
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
                  durationMs: result.durationMs,
                };
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
