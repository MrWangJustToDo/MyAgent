/**
 * CoreEnv — runtime-agnostic environment abstraction.
 *
 * All Node.js (or browser/other runtime) APIs used by @my-agent/core are
 * accessed through this interface. The consumer registers an implementation
 * via {@link registerCoreEnv} before using any core functionality.
 *
 * @example
 * ```typescript
 * import { registerCoreEnv } from "@my-agent/core";
 * import { createNodeEnv } from "@my-agent/node";
 *
 * registerCoreEnv(createNodeEnv({ rootPath: "/path/to/project" }));
 * ```
 */

import * as pathe from "pathe";

import { commandJobRegistry } from "./agent/tools/util/command-job-registry.js";

import type {
  CommandResult,
  FileEntry,
  RunCommandOptions,
  StartCommandHandle,
  StartCommandOptions,
} from "./environment/types.js";

// ============================================================================
// Path Utilities (synchronous — pure computation, no I/O)
// ============================================================================

export interface CoreEnvPath {
  join(...parts: string[]): string;
  dirname(p: string): string;
  basename(p: string, ext?: string): string;
  extname(p: string): string;
  resolve(...parts: string[]): string;
  normalize(p: string): string;
  isAbsolute(p: string): boolean;
  getSep(): string;
  parse(p: string): { root: string; dir: string; base: string; ext: string; name: string };
}

/**
 * Default path implementation using `pathe` (POSIX-style, works in any JS runtime).
 * Suitable for most environments. Consumers can override via {@link CoreEnv.path}.
 */
export const defaultPath: CoreEnvPath = {
  join: (...parts) => pathe.join(...parts),
  dirname: (p) => pathe.dirname(p),
  basename: (p, ext?) => pathe.basename(p, ext),
  extname: (p) => pathe.extname(p),
  resolve: (...parts) => pathe.resolve(...parts),
  normalize: (p) => pathe.normalize(p),
  isAbsolute: (p) => pathe.isAbsolute(p),
  getSep: () => "/",
  parse: (p) => pathe.parse(p),
};

// ============================================================================
// Encoding Utilities (synchronous — pure computation, no I/O)
// ============================================================================

/** Byte length of a UTF-8 string using TextEncoder. */
export function defaultByteLength(str: string, _encoding?: string): number {
  return new TextEncoder().encode(str).length;
}

/** Encode Uint8Array to base64 string. Works in all modern JS runtimes. */
export function defaultBase64Encode(data: Uint8Array): string {
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...data.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

/** Decode base64 string to Uint8Array. Works in all modern JS runtimes. */
export function defaultBase64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// File System
// ============================================================================

export interface CoreEnvFsStat {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface CoreEnvFs {
  /** Read file as UTF-8 text */
  readFile(path: string, encoding?: string): Promise<string>;
  /** Read file as binary data (for images, PDFs, etc.) */
  readFileBuffer?(path: string): Promise<Uint8Array>;
  /** Get file/directory stats */
  stat(path: string): Promise<CoreEnvFsStat>;
  /** List direct children of a directory */
  readdir(path: string): Promise<FileEntry[]>;
  /** Create or overwrite a file, creating parent directories when supported */
  writeFile(path: string, content: string): Promise<void>;
  /** Create a directory (recursive by default) */
  mkdir(path: string): Promise<void>;
  /** Return whether a path exists */
  exists(path: string): Promise<boolean>;
  /** Remove a file or directory */
  remove(path: string): Promise<void>;
  /** Append content to a file */
  appendFile?(path: string, content: string): Promise<void>;
}

// ============================================================================
// Shell Execution
// ============================================================================

export interface CoreEnvExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string | undefined>;
}

export interface CoreEnvExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// ============================================================================
// MCP Stdio Transport (optional, Node.js only)
// ============================================================================

export interface McpStdioTransportConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * A handle to a child process spawned by the MCP stdio transport.
 * Used for cleanup/force-kill on shutdown.
 */
export interface McpProcessHandle {
  killed: boolean;
  kill(signal?: string): boolean;
}

// ============================================================================
// CoreEnv Interface
// ============================================================================

export interface CoreEnv {
  /** Workspace root path for agent file operations and default command cwd */
  rootPath: string;

  /**
   * Path utilities (synchronous, pure computation).
   * Defaults to `defaultPath` (POSIX-style via `pathe`) if not provided.
   */
  path?: CoreEnvPath;

  /** Platform identifier (async — may require server query) */
  getPlatform: () => Promise<string>;

  /** Architecture (async — may require server query) */
  getArch: () => Promise<string>;

  /** Environment variables (async — may require server query) */
  getEnv: () => Promise<Record<string, string | undefined>>;

  /** Home directory path (async — may require server query) */
  homedir(): Promise<string>;

  /**
   * Byte length of a string (synchronous, pure computation).
   * Defaults to `defaultByteLength` (TextEncoder-based) if not provided.
   */
  byteLength?: (str: string, encoding?: string) => number;

  /**
   * Encode Uint8Array to base64 string (synchronous, pure computation).
   * Defaults to `defaultBase64Encode` if not provided.
   */
  base64Encode?: (data: Uint8Array) => string;

  /**
   * Decode base64 string to Uint8Array (synchronous, pure computation).
   * Defaults to `defaultBase64Decode` if not provided.
   */
  base64Decode?: (str: string) => Uint8Array;

  /** File system operations (workspace-scoped, async — I/O) */
  fs: CoreEnvFs;

  /**
   * Execute a shell command in the workspace (foreground — awaits exit).
   * Normal non-zero exit codes are returned in {@link CommandResult} without throwing.
   */
  runCommand(command: string, options?: RunCommandOptions): Promise<CommandResult>;

  /**
   * Start a shell command in the background without awaiting exit.
   * Optional — hosts that do not support background jobs omit this; tools feature-detect.
   * Stream callbacks and {@link StartCommandHandle.kill} are provided by the adapter;
   * job id / buffers live in the core JobRegistry used by tools.
   */
  startCommand?(command: string, options?: StartCommandOptions): Promise<StartCommandHandle>;

  /** Execute a simple shell command */
  exec(command: string, options?: CoreEnvExecOptions): Promise<CoreEnvExecResult>;

  /** HTTP fetch (replaces global fetch for runtime agnosticism) */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

  /** Lifecycle cleanup */
  destroy?(): Promise<void>;

  /** Get MIME type for a file path. Returns false/undefined if unknown. */
  getMimeType?(filePath: string): Promise<string | false>;

  /**
   * Create an MCP stdio transport (optional, Node.js only).
   * Returns an object compatible with `MCPClientConfig["transport"]`.
   */
  createMCPStdioTransport?(config: McpStdioTransportConfig): unknown;

  /**
   * Extract the child process handle from an MCP stdio transport (optional).
   * Used for force-killing MCP servers on shutdown.
   */
  getMCPTransportProcess?(transport: unknown): McpProcessHandle | undefined;
}

// ============================================================================
// Registry
// ============================================================================

let _env: CoreEnv | null = null;

/** Resolved environment with all defaults applied (non-optional accessors). */
export interface ResolvedCoreEnv extends CoreEnv {
  path: CoreEnvPath;
  byteLength: (str: string, encoding?: string) => number;
  base64Encode: (data: Uint8Array) => string;
  base64Decode: (str: string) => Uint8Array;
}

/**
 * Register the runtime environment for @my-agent/core.
 *
 * Must be called before using any core functionality.
 * The consumer (CLI, browser app, etc.) provides all platform-specific APIs.
 * Fields like `path`, `byteLength`, `base64Encode`, `base64Decode` are optional
 * and will fall back to built-in defaults if not provided.
 *
 * @example
 * ```typescript
 * // In a Node.js CLI:
 * registerCoreEnv(createNodeEnv());
 *
 * // In a browser extension:
 * registerCoreEnv(createBrowserEnv());
 * ```
 */
export function registerCoreEnv(env: CoreEnv): void {
  _env = env;
}

/**
 * Clear the registered CoreEnv, preventing stale references after disconnect.
 * After calling this, {@link getEnv} will throw until a new env is registered.
 * Also best-effort kills any background command jobs.
 */
export function clearCoreEnv(): void {
  void commandJobRegistry.destroyAll();
  _env = null;
}

/**
 * Get the registered runtime environment with defaults applied.
 *
 * @throws if {@link registerCoreEnv} has not been called yet.
 */
export function getEnv(): ResolvedCoreEnv {
  if (!_env) {
    throw new Error(
      "CoreEnv not registered. Call registerCoreEnv() before using @my-agent/core. " +
        "See the CoreEnv interface for the required API surface."
    );
  }
  return {
    ..._env,
    path: _env.path ?? defaultPath,
    byteLength: _env.byteLength ?? defaultByteLength,
    base64Encode: _env.base64Encode ?? defaultBase64Encode,
    base64Decode: _env.base64Decode ?? defaultBase64Decode,
  };
}

/**
 * Check whether a CoreEnv has been registered.
 */
export function hasCoreEnv(): boolean {
  return _env !== null;
}
