/**
 * Agent Documentation Loader (AGENTS.md / CLAUDE.md)
 *
 * This module provides a standardized way to load agent-specific documentation
 * files (AGENTS.md, CLAUDE.md, etc.) from the project root and inject them
 * into the agent's system prompt.
 *
 * This follows the cross-tool standard established by AGENTS.md (stewarded by
 * the Linux Foundation's Agentic AI Foundation) and is compatible with how
 * Claude Code, Codex CLI, Cursor, Gemini CLI, and other tools discover and
 * load project instructions.
 *
 * @see https://agents.md/
 */

import { getEnv } from "../env.js";

import type { AgentLog } from "./agent-log";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default filenames to search for, in priority order.
 *
 * - `CLAUDE.md` first: Claude Code's native format (higher priority for Claude users)
 * - `AGENTS.md` second: The cross-tool standard (Linux Foundation, 60k+ projects)
 *
 * Agents look for these files and use the first one found.
 */
export const DEFAULT_AGENT_DOC_FILENAMES = ["CLAUDE.md", "AGENTS.md"];

/**
 * Default maximum bytes to read from a single agent documentation file.
 * Matches Codex CLI's project_doc_max_bytes default (65536 = 64 KiB).
 */
export const DEFAULT_AGENT_DOC_MAX_BYTES = 65536;

// ============================================================================
// Types
// ============================================================================

/** Configuration for the agent documentation loader */
export interface AgentDocLoaderConfig {
  /** Root path of the project */
  rootPath: string;
  /**
   * Filenames to search for, in priority order.
   * Defaults to [CLAUDE.md, AGENTS.md]
   */
  filenames?: string[];
  /**
   * Maximum bytes per file (default: 65536).
   * Content beyond this limit is silently truncated with a notice.
   */
  maxBytes?: number;
  /**
   * Whether to also look for a local override file.
   * For AGENTS.md, this would be AGENTS.override.md (gitignored, personal overrides).
   * For CLAUDE.md, there's no standard override pattern.
   * Default: true
   */
  loadOverride?: boolean;
  /** Optional logger for debug output */
  logger?: AgentLog;
}

/** Result of loading agent documentation */
export interface AgentDocLoadResult {
  /** The loaded content (empty string if no file was found) */
  content: string;
  /** Which file was loaded (e.g., "/project/AGENTS.md") */
  source?: string;
  /** Override content if an override file was also found (e.g., AGENTS.override.md) */
  overrideContent?: string;
  /** Which override file was loaded */
  overrideSource?: string;
}

/**
 * Human-readable description of what was loaded.
 * Returns a formatted string like "Loaded instructions from AGENTS.md (2.1 KB)"
 */
export function formatAgentDocResult(result: AgentDocLoadResult): string {
  const env = getEnv();
  const parts: string[] = [];

  if (result.source) {
    const size = result.content.length;
    const sizeKB = (size / 1024).toFixed(1);
    parts.push(`Loaded instructions from ${env.path.basename(result.source)} (${sizeKB} KB)`);
  }

  if (result.overrideSource && result.overrideContent != null) {
    const sizeKB = (result.overrideContent.length / 1024).toFixed(1);
    parts.push(`Loaded override from ${env.path.basename(result.overrideSource)} (${sizeKB} KB)`);
  }

  return parts.join("; ") || "No agent documentation files found";
}

// ============================================================================
// Main Loader Functions
// ============================================================================

/**
 * Search for and load agent documentation files from the project root.
 *
 * Discovery algorithm (matching cross-tool conventions):
 * 1. Look for each configured filename in order (CLAUDE.md, AGENTS.md)
 * 2. Use the FIRST one found (priority ordering)
 * 3. If `loadOverride` is enabled, also look for AGENTS.override.md
 *    alongside the found file
 * 4. Truncate content that exceeds maxBytes with a notice
 *
 * @param config - Loader configuration
 * @returns The loaded content and metadata
 *
 * @example
 * ```typescript
 * const result = await loadAgentDoc({
 *   rootPath: "/project",
 *   rootPath: "/project",
 *   logger: log,
 * });
 * // result.content contains the contents of AGENTS.md or CLAUDE.md
 * ```
 */
export async function loadAgentDoc(config: AgentDocLoaderConfig): Promise<AgentDocLoadResult> {
  const env = getEnv();
  const {
    rootPath,
    filenames = DEFAULT_AGENT_DOC_FILENAMES,
    maxBytes = DEFAULT_AGENT_DOC_MAX_BYTES,
    loadOverride = true,
    logger,
  } = config;

  let result: AgentDocLoadResult = { content: "" };

  for (const filename of filenames) {
    const filePath = env.path.join(rootPath, filename);
    try {
      const exists = await env.fs.exists(filePath);
      if (exists) {
        const rawContent = await env.fs.readFile(filePath);

        const content = truncateContent(rawContent, maxBytes, filename);
        result = { ...result, content, source: filePath };

        if (loadOverride) {
          const overrideResult = await loadOverrideFile(rootPath, filename);
          if (overrideResult) {
            result = { ...result, ...overrideResult };
          }
        }

        break;
      }
    } catch (err) {
      logger?.debug("system", `Error checking file ${filename}`, { error: String(err) });
      continue;
    }
  }

  if (!result.content) {
    logger?.debug("system", "No agent documentation file found (searched: " + filenames.join(", ") + ")");
  }

  return result;
}

/**
 * Load an override file alongside the primary documentation.
 *
 * Converts "AGENTS.md" → "AGENTS.override.md" in the same directory.
 * Override files are meant to be gitignored (personal/local overrides).
 */
async function loadOverrideFile(
  rootPath: string,
  primaryFilename: string
): Promise<{ overrideContent: string; overrideSource: string } | null> {
  const env = getEnv();
  const parsed = env.path.parse(primaryFilename);
  const overrideFilename = `${parsed.name}.override${parsed.ext}`;

  if (overrideFilename === primaryFilename) return null;

  const overridePath = env.path.join(rootPath, overrideFilename);

  try {
    const exists = await env.fs.exists(overridePath);
    if (exists) {
      const rawContent = await env.fs.readFile(overridePath);
      const overrideContent = truncateContent(rawContent, DEFAULT_AGENT_DOC_MAX_BYTES, overrideFilename);
      return { overrideContent, overrideSource: overridePath };
    }
  } catch {
    // Override file not found or unreadable — that's fine
  }

  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Truncate content that exceeds maxBytes, adding a notice.
 * Returns the original content if within limits.
 */
function truncateContent(content: string, maxBytes: number, filename: string): string {
  const contentBytes = getEnv().byteLength(content, "utf-8");
  if (contentBytes <= maxBytes) return content;

  const truncateAt = Math.min(maxBytes, content.length);
  const lineBreak = content.lastIndexOf("\n", truncateAt);
  const cutPoint = lineBreak > 0 ? lineBreak : truncateAt;

  return (
    content.slice(0, cutPoint) +
    `\n\n[Content truncated at ${maxBytes / 1024} KiB (was ${(contentBytes / 1024).toFixed(1)} KiB). ` +
    `The file ${filename} is too large and was cut here.]\n`
  );
}
