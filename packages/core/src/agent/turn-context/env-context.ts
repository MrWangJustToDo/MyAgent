/**
 * Environment context utilities shared between root agent and subagents.
 *
 * Extracts date and git info — the two pieces of dynamic context that are
 * needed by both the root agent's turn context system and subagent runs.
 */

import { getEnv } from "../../env.js";

export interface GitInfo {
  branch?: string;
  status?: string;
}

/**
 * Current date formatted for `<current_date>` turn context.
 * Day granularity keeps it stable within a session day (prefix-cache friendly).
 */
export function getCurrentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZoneName: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Fetch git branch and status from the workspace.
 * Both calls are best-effort — failures are silently ignored.
 */
export async function getGitInfo(): Promise<GitInfo> {
  const env = getEnv();
  const info: GitInfo = {};

  try {
    const branchResult = await env.runCommand("git branch --show-current", {
      cwd: env.rootPath,
      timeout: 2000,
    });
    if (branchResult.exitCode === 0) {
      info.branch = branchResult.stdout.trim();
    }
  } catch {
    // Git not available or not a git repo — skip
  }

  try {
    const statusResult = await env.runCommand("git status --short", {
      cwd: env.rootPath,
      timeout: 2000,
    });
    if (statusResult.exitCode === 0 && statusResult.stdout.trim()) {
      info.status = statusResult.stdout.trim();
    }
  } catch {
    // Git not available — skip
  }

  return info;
}