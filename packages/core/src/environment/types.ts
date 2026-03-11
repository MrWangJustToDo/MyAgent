/**
 * Environment abstraction types
 *
 * This module defines the unified interface for different execution environments.
 * Environments can be local (just-bash), remote (compute gateway), or custom implementations.
 */

/**
 * File entry returned by filesystem operations
 */
export interface FileEntry {
  name: string;
  type: "file" | "directory";
  /** File size in bytes (optional, may not be available in all environments) */
  size?: number;
  /** Last modification date (optional, may not be available in all environments) */
  modified?: Date;
}

/**
 * Options for running commands
 */
export interface RunCommandOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run in background */
  background?: boolean;
}

/**
 * Result of command execution
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Filesystem interface that all environments must implement
 */
export interface SandboxFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readdir(path: string): Promise<FileEntry[]>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

/**
 * Unified sandbox interface that all environments must implement.
 * This is the minimal API surface that tools use.
 */
export interface Sandbox {
  /** Unique identifier for this sandbox instance */
  readonly sandboxId: string;
  /** Provider name (e.g., 'local', 'remote', 'just-bash') */
  readonly provider: string;
  /** Filesystem operations */
  readonly filesystem: SandboxFileSystem;
  /** Execute a shell command */
  runCommand(command: string, options?: RunCommandOptions): Promise<CommandResult>;
  /** Destroy and cleanup the sandbox */
  destroy(): Promise<void>;
}

/**
 * Configuration for creating a sandbox
 */
export interface SandboxConfig {
  /** Root path for the sandbox (maps to filesystem root) */
  rootPath: string;
  /** Current working directory within the sandbox */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Environment interface - factory for creating sandboxes.
 * Implement this interface to support different execution backends.
 */
export interface Environment {
  /** Environment name for identification */
  readonly name: string;

  /**
   * Create a new sandbox instance
   */
  createSandbox(config: SandboxConfig): Promise<Sandbox>;

  /**
   * Get an existing sandbox by ID (if supported)
   * Returns undefined if not found or not supported
   */
  getSandboxById?(sandboxId: string): Promise<Sandbox | undefined>;
}

/**
 * Environment type identifier for easy switching
 */
export type EnvironmentType = "local" | "remote" | Environment;

/**
 * Resolve environment type to an Environment instance
 */
export function isEnvironmentInstance(env: EnvironmentType): env is Environment {
  return typeof env === "object" && "name" in env && "createSandbox" in env;
}
