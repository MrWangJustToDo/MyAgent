/**
 * Cross-platform shell utilities for command execution.
 *
 * Provides:
 * - Shell detection (Linux, macOS, Windows with Git Bash detection)
 * - Process tree killing (SIGTERM → SIGKILL escalation)
 * - Detached child PID tracking for cleanup
 */

import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { platform } from "node:os";

// ============================================================================
// Shell Configuration
// ============================================================================

export interface ShellConfig {
  /** Path to the shell executable */
  shell: string;
  /** Arguments to pass for command execution (e.g., ["-l", "-c"]) */
  args: string[];
}

/**
 * Detect the platform and return the appropriate shell configuration.
 *
 * Resolution order:
 * 1. Explicit `shellPath` parameter
 * 2. `SHELL` environment variable
 * 3. Platform default (/bin/bash on macOS/Linux, Git Bash or PowerShell on Windows)
 */
export async function getShellConfig(shellPath?: string): Promise<ShellConfig> {
  const isWindows = platform() === "win32";

  if (shellPath) {
    return {
      shell: shellPath,
      args: isWindows && !shellPath.includes("bash") ? ["-c"] : ["-l", "-c"],
    };
  }

  const envShell = process.env.SHELL;

  if (envShell) {
    return {
      shell: envShell,
      args: isWindows && !envShell.includes("bash") ? ["-c"] : ["-l", "-c"],
    };
  }

  if (isWindows) {
    const gitBashPath = await findGitBash();
    if (gitBashPath) {
      return { shell: gitBashPath, args: ["-l", "-c"] };
    }
    return { shell: "powershell.exe", args: ["-Command"] };
  }

  return { shell: "/bin/bash", args: ["-l", "-c"] };
}

/**
 * Try to find Git Bash on Windows.
 * Checks common installation paths.
 */
export async function findGitBash(): Promise<string | undefined> {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Git\\bin\\bash.exe`,
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

/**
 * Get the default shell environment variables for spawned processes.
 * Inherits from process.env with any necessary sanitization.
 */
export function getShellEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

// ============================================================================
// Process Tree Management
// ============================================================================

/** Tracked detached child PIDs for lifecycle management */
const trackedPids = new Set<number>();

/**
 * Track a detached child process PID so it can be cleaned up later.
 * Call {@link untrackDetachedChildPid} when the process completes normally.
 */
export function trackDetachedChildPid(pid: number): void {
  trackedPids.add(pid);
}

/**
 * Stop tracking a detached child process PID.
 */
export function untrackDetachedChildPid(pid: number): void {
  trackedPids.delete(pid);
}

/**
 * Get all currently tracked PIDs.
 */
export function getTrackedPids(): number[] {
  return Array.from(trackedPids);
}

/**
 * Kill a process and its entire process tree.
 *
 * Strategy:
 * 1. Send SIGTERM to the process group (negative PID) on Unix
 * 2. Fall back to SIGTERM on the process itself
 * 3. Force SIGKILL after 5 seconds if the process hasn't exited
 *
 * On Windows, uses `taskkill /T /F` for tree killing since negative PID
 * signals are not supported.
 */
export async function killProcessTree(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): Promise<void> {
  if (platform() === "win32") {
    await killProcessTreeWindows(pid);
    return;
  }

  try {
    // Negative PID = process group kill (includes all children)
    process.kill(-pid, signal);
  } catch {
    // Process group may not exist; fall back to single process
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already be dead
    }
  }
}

/**
 * Kill a process tree on Windows using `taskkill`.
 */
async function killProcessTreeWindows(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.on("close", () => resolve());
    child.on("error", () => resolve());

    // Timeout the taskkill call after 5 seconds
    setTimeout(() => resolve(), 5000);
  });
}

// ============================================================================
// Process Execution (Spawn Wrapper)
// ============================================================================

export interface SpawnOptions {
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env?: NodeJS.ProcessEnv;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Timeout in seconds (if undefined, no timeout) */
  timeout?: number;
  /** Called with stdout data chunks */
  onStdout?: (data: string) => void;
  /** Called with stderr data chunks */
  onStderr?: (data: string) => void;
  /** Custom shell path override */
  shellPath?: string;
}

export interface SpawnResult {
  exitCode: number | null;
  timedOut: boolean;
}

export interface SpawnShellStringOptions extends SpawnOptions {
  /** When true, `command` is passed to the shell as a single string (for pre-wrapped sandbox commands). */
  useShellString?: boolean;
}

/**
 * Spawn a command in the platform shell with proper process tree management.
 *
 * Features:
 * - Cross-platform shell resolution
 * - Process tree tracking for cleanup
 * - Abort signal support with full tree kill
 * - Timeout with SIGTERM → SIGKILL escalation
 * - Streaming stdout/stderr via callbacks
 */
export async function spawnCommand(command: string, options: SpawnShellStringOptions): Promise<SpawnResult> {
  const isWindows = platform() === "win32";

  // Verify working directory exists
  try {
    await access(options.cwd, constants.F_OK);
  } catch {
    throw new Error(`Working directory does not exist: ${options.cwd}`);
  }

  // Check for pre-existing abort
  if (options.signal?.aborted) {
    throw new Error("aborted");
  }

  let child: ChildProcess;
  if (options.useShellString) {
    child = spawn(command, {
      shell: true,
      cwd: options.cwd,
      detached: !isWindows,
      env: options.env ?? getShellEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    const { shell, args } = await getShellConfig(options.shellPath);
    child = spawn(shell, [...args, command], {
      cwd: options.cwd,
      detached: !isWindows,
      env: options.env ?? getShellEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  // Track the child PID
  if (child.pid) {
    trackDetachedChildPid(child.pid);
  }

  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | undefined;
  let isAborted = false;

  // Create an abort handler that kills the process tree
  const onAbort = () => {
    isAborted = true;
    if (child.pid) {
      killProcessTree(child.pid, "SIGTERM").then(() => {
        // Force kill after 5 seconds
        setTimeout(() => {
          if (child.pid) {
            killProcessTree(child.pid, "SIGKILL");
          }
        }, 5000);
      });
    }
  };

  try {
    // Set timeout if provided
    if (options.timeout !== undefined && options.timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        onAbort();
      }, options.timeout * 1000);
    }

    // Stream stdout
    if (options.onStdout && child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        options.onStdout?.(data.toString("utf-8"));
      });
    }

    // Stream stderr
    if (options.onStderr && child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        options.onStderr?.(data.toString("utf-8"));
      });
    }

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    // Handle process spawn errors
    child.on("error", (err: Error) => {
      // If the process was already aborted/timed out, this is expected
      if (!isAborted && !timedOut) {
        // Store the error for re-throwing
        throw err;
      }
    });

    // Wait for the process to finish
    const exitCode = await waitForChildProcess(child);

    // Check if abort happened during execution
    if (options.signal?.aborted) {
      throw new Error("aborted");
    }

    if (timedOut) {
      throw new Error(`timeout:${options.timeout}`);
    }

    return { exitCode, timedOut };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "aborted" || (options.signal?.aborted && !isAborted)) {
        throw new Error("aborted");
      }
      if (err.message.startsWith("timeout:")) {
        throw err; // re-throw timeout as-is
      }
    }
    throw err;
  } finally {
    // Cleanup
    if (child.pid) {
      untrackDetachedChildPid(child.pid);
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (options.signal) {
      try {
        options.signal.removeEventListener("abort", onAbort);
      } catch {
        // Signal may have been aborted already
      }
    }
  }
}

/**
 * Wait for a child process to exit without hanging on inherited stdio
 * handles held open by detached descendants.
 *
 * This handles the case where a detached child process inherits the parent's
 * stdio handles, which can prevent the parent from detecting child exit.
 */
export function waitForChildProcess(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    // Close stdin immediately since we don't write to it
    child.stdin?.destroy();

    let resolved = false;

    const onClose = (code: number | null) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    };

    const onError = (err: Error) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    };

    child.on("close", onClose);
    child.on("error", onError);

    // Safety timeout: if neither close nor error fires within 30 seconds,
    // force resolve to prevent hanging. This can happen with detached
    // processes that keep stdio handles open.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill("SIGKILL");
        resolve(null);
      }
    }, 30000);
  });
}
