/**
 * Environment abstraction types
 *
 * This module defines the unified interface for different execution environments.
 * Environments can be local (just-bash), remote (compute gateway), or custom implementations.
 */

// ============================================================================
// Typed Errors
// ============================================================================

/**
 * Stable, backend-independent file error codes returned by filesystem operations.
 */
export type FileErrorCode =
  | "not_found"
  | "permission_denied"
  | "not_directory"
  | "is_directory"
  | "invalid"
  | "not_supported"
  | "aborted"
  | "unknown";

/**
 * Typed error for filesystem operation failures.
 * Unlike plain Errors, these carry a structured error code for programmatic handling.
 *
 * @example
 * ```typescript
 * try {
 *   await sandbox.filesystem.readFile('/path');
 * } catch (err) {
 *   if (err instanceof FileError && err.code === 'not_found') {
 *     // Handle missing file gracefully
 *   }
 * }
 * ```
 */
export class FileError extends Error {
  /** Backend-independent error code */
  public code: FileErrorCode;
  /** Absolute addressed path associated with the failure, when available */
  public path?: string;

  constructor(code: FileErrorCode, message: string, path?: string, cause?: Error) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "FileError";
    this.code = code;
    this.path = path;
  }
}

/**
 * Stable, backend-independent execution error codes.
 */
export type ExecutionErrorCode =
  | "aborted"
  | "timeout"
  | "shell_unavailable"
  | "spawn_error"
  | "callback_error"
  | "unknown";

/**
 * Typed error for command execution failures.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await sandbox.runCommand('npm install', { timeout: 30000 });
 * } catch (err) {
 *   if (err instanceof ExecutionError && err.code === 'timeout') {
 *     // Handle timeout
 *   }
 * }
 * ```
 */
export class ExecutionError extends Error {
  /** Backend-independent error code */
  public code: ExecutionErrorCode;

  constructor(code: ExecutionErrorCode, message: string, cause?: Error) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExecutionError";
    this.code = code;
  }
}

// ============================================================================
// File System Types
// ============================================================================

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
 * File stat information
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Whether this is a file */
  isFile: boolean;
  /** Last modification time */
  mtime: Date;
}

// ============================================================================
// Command Execution Types
// ============================================================================

/**
 * Options for running commands, with streaming support.
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
  /** Called with stdout chunks as they are produced (streaming). */
  onStdout?: (chunk: string) => void;
  /** Called with stderr chunks as they are produced (streaming). */
  onStderr?: (chunk: string) => void;
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

// ============================================================================
// Sandbox & Filesystem Interfaces
// ============================================================================

/**
 * Filesystem interface that all environments must implement.
 *
 * Operations may throw {@link FileError} with typed error codes
 * for structured error handling.
 */
export interface SandboxFileSystem {
  /** Read file as UTF-8 text */
  readFile(path: string): Promise<string>;
  /** Read file as binary buffer (for images, PDFs, etc.) */
  readFileBuffer?(path: string): Promise<Buffer>;
  /** Get file/directory stats */
  stat?(path: string): Promise<FileStat>;
  /** Create or overwrite a file, creating parent directories when supported */
  writeFile(path: string, content: string): Promise<void>;
  /** List direct children of a directory */
  readdir(path: string): Promise<FileEntry[]>;
  /** Create a directory (recursive by default) */
  mkdir(path: string): Promise<void>;
  /** Return whether a path exists */
  exists(path: string): Promise<boolean>;
  /** Remove a file or directory */
  remove(path: string): Promise<void>;
  /**
   * Append content to a file.
   * Creates the file if it doesn't exist, appends if it does.
   */
  appendFile?(path: string, content: string): Promise<void>;
  /**
   * Copy a file from source to destination.
   * Throws if the target already exists.
   */
  copy?(sourcePath: string, targetPath: string): Promise<void>;
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
  /**
   * Execute a shell command.
   *
   * Throws {@link ExecutionError} on failures like abort, timeout,
   * or shell unavailability. Normal non-zero exit codes are returned
   * in {@link CommandResult} without throwing.
   */
  runCommand(command: string, options?: RunCommandOptions): Promise<CommandResult>;
  /** Destroy and cleanup the sandbox */
  destroy(): Promise<void>;
}

// ============================================================================
// Environment Factory
// ============================================================================

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

// ============================================================================
// Environment Type Resolution
// ============================================================================

/**
 * Environment type identifier for easy switching
 * - "local": Uses just-bash for isolated sandbox execution (default)
 * - "native": Uses real bash and Node.js fs for direct system access
 * - "remote": Uses remote compute gateway for cloud execution
 */
export type EnvironmentType = "local" | "native" | "remote" | Environment;

/**
 * Resolve environment type to an Environment instance
 */
export function isEnvironmentInstance(env: EnvironmentType): env is Environment {
  return typeof env === "object" && "name" in env && "createSandbox" in env;
}
