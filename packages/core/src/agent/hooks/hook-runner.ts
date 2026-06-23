import { getEnv } from "../../env.js";

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
async function executeCommandHook(
  command: string,
  input: HookEventInput,
  cwd: string,
  timeout?: number
): Promise<HookResult> {
  const env = getEnv();
  const timeoutMs = timeout ?? DEFAULT_HOOK_TIMEOUT_MS;
  const inputJson = JSON.stringify(input);

  const fullCommand = `echo '${inputJson.replace(/'/g, "'\\''")}' | ${command}`;

  const runEnv = await env.getEnv();

  try {
    const result = await env.exec(fullCommand, {
      cwd,
      timeout: timeoutMs,
      env: { ...runEnv, AGENT_HOOKS: "1" } as Record<string, string>,
    });

    if (result.code === 2) {
      const reason = parseStdoutReason(result.stdout) || result.stderr.trim() || "Denied by hook";
      return { decision: "deny", reason };
    }

    if (result.code !== 0 && result.code !== null) {
      throw new Error(`Hook command failed (exit ${result.code}): ${result.stderr.trim()}`);
    }

    return parseStdoutResult(result.stdout);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Execute a JS/TS code hook via subprocess.
 * The module must export a default function: `(input, output) => void | Promise<void>`
 *
 * Runs the hook in a Node.js subprocess so that:
 * - No `dynamicImport` API is needed on CoreEnv
 * - Works identically in local and remote (HTTP) environments
 * - Consistent with how command hooks are executed
 */
async function executeCodeHook(
  hookPath: string,
  input: HookEventInput,
  rootPath: string,
  timeout?: number
): Promise<HookResult> {
  const env = getEnv();
  const timeoutMs = timeout ?? DEFAULT_HOOK_TIMEOUT_MS;
  const fullPath = env.path.resolve(rootPath, hookPath);
  const inputJson = JSON.stringify(input);

  const script = [
    `import(${JSON.stringify(fullPath)}).then(m => {`,
    `  const fn = m.default ?? m;`,
    `  if (typeof fn !== 'function') { process.stderr.write('Hook does not export a function'); process.exit(1); }`,
    `  const output = {};`,
    `  return Promise.resolve(fn(JSON.parse(process.argv[1]), output)).then(() => {`,
    `    process.stdout.write(JSON.stringify(output));`,
    `  });`,
    `}).catch(e => { process.stderr.write(e.message || String(e)); process.exit(1); });`,
  ].join(" ");

  const escapedInput = inputJson.replace(/'/g, "'\\''");
  const result = await env.exec(`node --input-type=module -e '${script}' '${escapedInput}'`, {
    cwd: rootPath,
    timeout: timeoutMs,
  });

  if (result.code !== 0 && result.code !== null) {
    throw new Error(`Code hook failed (${hookPath}): ${result.stderr.trim()}`);
  }

  return parseStdoutResult(result.stdout);
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
