import { exec } from "node:child_process";
import { resolve } from "node:path";

import { DEFAULT_HOOK_TIMEOUT_MS } from "./types.js";

import type { HookRegistry } from "./hook-registry.js";
import type { HookEntry, HookEventInput, HookEventType, HookResult } from "./types.js";

// ============================================================================
// HookRunner
// ============================================================================

/**
 * Run hooks for a given event. Returns aggregated HookResult.
 *
 * For PreToolUse: first "deny" result wins and short-circuits.
 * For all other events: errors are logged but don't throw.
 */
export async function runHooks(
  registry: HookRegistry,
  event: HookEventType,
  input: HookEventInput,
  options?: { matchValue?: string; logger?: HookLogger }
): Promise<HookResult> {
  const entries = registry.getMatchingHooks(event, options?.matchValue);
  if (entries.length === 0) return {};

  const isBlocking = event === "PreToolUse";
  const rootPath = registry.getRootPath();
  const result: HookResult = {};

  for (const entry of entries) {
    try {
      const hookResult = await executeHook(entry, input, rootPath);

      if (isBlocking && hookResult.decision === "deny") {
        return hookResult;
      }

      if (hookResult.modifiedInput !== undefined) {
        result.modifiedInput = hookResult.modifiedInput;
      }
      if (hookResult.decision) {
        result.decision = hookResult.decision;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      options?.logger?.warn("hooks", `Hook failed for ${event}: ${msg}`);
      if (isBlocking) throw err;
    }
  }

  return result;
}

// ============================================================================
// Hook Execution
// ============================================================================

async function executeHook(entry: HookEntry, input: HookEventInput, rootPath: string): Promise<HookResult> {
  if (entry.type === "command" && entry.command) {
    return executeCommandHook(entry.command, input, rootPath, entry.timeout);
  }
  if (entry.type === "code" && entry.path) {
    return executeCodeHook(entry.path, input, rootPath, entry.timeout);
  }
  return {};
}

/**
 * Execute a shell command hook.
 * JSON context is piped via stdin. Optional JSON response parsed from stdout.
 */
function executeCommandHook(
  command: string,
  input: HookEventInput,
  cwd: string,
  timeout?: number
): Promise<HookResult> {
  const timeoutMs = timeout ?? DEFAULT_HOOK_TIMEOUT_MS;
  const inputJson = JSON.stringify(input);

  return new Promise((resolvePromise, reject) => {
    const child = exec(
      command,
      { cwd, timeout: timeoutMs, env: { ...process.env, AGENT_HOOKS: "1" } },
      (err, stdout, stderr) => {
        if (err) {
          // Exit code 2 = deny (Claude Code convention)
          if (err.code === 2) {
            const reason = parseStdoutReason(stdout) || stderr.trim() || "Denied by hook";
            resolvePromise({ decision: "deny", reason });
            return;
          }
          reject(new Error(`Hook command failed (exit ${err.code}): ${stderr.trim() || err.message}`));
          return;
        }

        resolvePromise(parseStdoutResult(stdout));
      }
    );

    if (child.stdin) {
      child.stdin.write(inputJson);
      child.stdin.end();
    }
  });
}

/**
 * Execute a JS/TS code hook via dynamic import.
 * The module must export a default function: `(input, output) => void | Promise<void>`
 */
async function executeCodeHook(
  hookPath: string,
  input: HookEventInput,
  rootPath: string,
  timeout?: number
): Promise<HookResult> {
  const timeoutMs = timeout ?? DEFAULT_HOOK_TIMEOUT_MS;
  const fullPath = resolve(rootPath, hookPath);

  const mod = await import(fullPath);
  const fn = mod.default ?? mod;
  if (typeof fn !== "function") {
    throw new Error(`Hook at ${hookPath} does not export a function`);
  }

  const output: HookResult = {};

  const result = Promise.resolve(fn(input, output));
  const timer = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`Hook timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  await Promise.race([result, timer]);
  return output;
}

// ============================================================================
// Helpers
// ============================================================================

function parseStdoutResult(stdout: string): HookResult {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const result: HookResult = {};
    if (parsed.decision === "deny" || parsed.decision === "allow") {
      result.decision = parsed.decision;
    }
    if (typeof parsed.reason === "string") {
      result.reason = parsed.reason;
    }
    if (parsed.modifiedInput !== undefined) {
      result.modifiedInput = parsed.modifiedInput;
    }
    return result;
  } catch {
    return {};
  }
}

function parseStdoutReason(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return trimmed;
  }
}

/** Minimal logger interface for hook errors — uses method syntax for AgentLog compatibility */
export interface HookLogger {
  warn(category: string, message: string, ...args: unknown[]): unknown;
}

// ============================================================================
// Convenience: fire-and-forget for non-blocking events
// ============================================================================

/**
 * Emit a hook event without awaiting or blocking.
 * Errors are silently logged. Use for SessionStart, Stop, Notification, etc.
 */
export function emitHook(
  registry: HookRegistry | null | undefined,
  event: HookEventType,
  input: HookEventInput,
  options?: { matchValue?: string; logger?: HookLogger }
): void {
  if (!registry) return;
  runHooks(registry, event, input, options).catch((err) => {
    options?.logger?.warn("hooks", `emitHook(${event}) error: ${err}`);
  });
}
