/**
 * Instruction-context detection and formatting for dynamic turn context.
 *
 * The agent documentation (AGENTS.md / CLAUDE.md) is loaded once at agent
 * creation and frozen into the system prompt's `<project_instructions>`.
 * If the model edits those files via tools, the frozen prompt keeps stale
 * instructions until the session restarts. This module detects such changes
 * so turn_context can re-inject the latest instruction content.
 *
 * Cache-friendly design: we only re-inject when the instruction file digest
 * changed since the last admit (hash-driven, same epoch pattern as
 * turn_context itself). When nothing changed, the payload is byte-identical
 * and the prompt-cache breakpoint stays stable.
 */

import { getEnv } from "../../env.js";

import { hashTurnContextPayload } from "./turn-context-message.js";

// ============================================================================
// Types
// ============================================================================

/** A discovered instruction file (primary or override). */
export interface InstructionFile {
  /** Absolute path to the instruction file. */
  path: string;
  /** Base filename (AGENTS.md, CLAUDE.md, AGENTS.override.md). */
  name: string;
  /** FNV-1a digest of the instruction content. */
  digest: string;
}

/** Latest instruction state used for change detection. */
export interface InstructionContextState {
  /** Primary instruction file (AGENTS.md / CLAUDE.md) — undefined when none. */
  primary: InstructionFile | undefined;
  /** Override instruction file (e.g. AGENTS.override.md) — undefined when none. */
  override: InstructionFile | undefined;
}

// ============================================================================
// Constants
// ============================================================================

/** Instruction filenames in discovery priority order (matches agent-doc-loader). */
export const INSTRUCTION_FILENAMES = ["CLAUDE.md", "AGENTS.md"];

/** Maximum bytes read from an instruction file (matches agent-doc-loader default). */
export const INSTRUCTION_MAX_BYTES = 65536;

/** Marker describing the instruction context section. */
const INSTRUCTION_CONTEXT_OPEN = "<instruction_context>";
const INSTRUCTION_CONTEXT_CLOSE = "</instruction_context>";

// ============================================================================
// Discovery & hashing
// ============================================================================

/**
 * Read the current instruction file state (paths + digests only — content is
 * not retained in memory to avoid keeping large file bodies around).
 *
 * Discovery mirrors {@link import("../agent-doc-loader.js").loadAgentDoc}:
 * - first existing file in `INSTRUCTION_FILENAMES` order wins
 * - a sibling override file (e.g. `AGENTS.override.md`) is loaded when present
 *
 * @returns The discovered instruction state (empty files when none found).
 */
export async function readInstructionContextState(): Promise<InstructionContextState> {
  const env = getEnv();
  const state: InstructionContextState = { primary: undefined, override: undefined };

  for (const filename of INSTRUCTION_FILENAMES) {
    const filePath = env.path.join(env.rootPath, filename);
    try {
      const exists = await env.fs.exists(filePath);
      if (!exists) continue;

      const content = await env.fs.readFile(filePath);
      state.primary = { path: filePath, name: filename, digest: digestContent(content) };

      const overridePath = env.path.join(env.path.dirname(filePath), overrideFilename(filename));
      const override = await readOverrideFile(overridePath);
      if (override) state.override = override;
      break;
    } catch {
      // Unreadable instruction file — skip to next candidate.
      continue;
    }
  }

  return state;
}

/** Load an override instruction file (e.g. AGENTS.override.md) if present. */
async function readOverrideFile(overridePath: string): Promise<InstructionFile | undefined> {
  const env = getEnv();
  try {
    const exists = await env.fs.exists(overridePath);
    if (!exists) return undefined;
    const content = await env.fs.readFile(overridePath);
    return {
      path: overridePath,
      name: env.path.basename(overridePath),
      digest: digestContent(content),
    };
  } catch {
    return undefined;
  }
}

/** Derive the override filename for a primary filename (AGENTS.md → AGENTS.override.md). */
function overrideFilename(primaryFilename: string): string {
  const env = getEnv();
  const parsed = env.path.parse(primaryFilename);
  return `${parsed.name}.override${parsed.ext}`;
}

/** Hash instruction content (truncated to the byte budget first). */
function digestContent(content: string): string {
  return hashTurnContextPayload(`instruction\n${truncateContent(content)}`);
}

/** Truncate content to the byte budget (matches agent-doc-loader's max-bytes rule). */
function truncateContent(content: string): string {
  return truncateContentWithFlag(content).content;
}

/**
 * Truncate content to the byte budget and report whether truncation occurred.
 *
 * Used by the re-injection path so an oversized instruction file is surfaced
 * to the model instead of being silently cut off.
 */
function truncateContentWithFlag(content: string): { content: string; truncated: boolean } {
  const env = getEnv();
  if (env.byteLength(content, "utf-8") <= INSTRUCTION_MAX_BYTES) {
    return { content, truncated: false };
  }
  return { content: content.slice(0, INSTRUCTION_MAX_BYTES), truncated: true };
}

// ============================================================================
// Comparison
// ============================================================================

/** Compare two instruction states and report which files changed. */
export function diffInstructionStates(
  before: InstructionContextState | undefined,
  after: InstructionContextState
): { primaryChanged: boolean; overrideChanged: boolean } {
  const primaryChanged = before?.primary?.digest !== after.primary?.digest;
  const overrideChanged = before?.override?.digest !== after.override?.digest;
  return { primaryChanged, overrideChanged };
}

/** Whether any instruction file digest differs between two states. */
export function instructionStateChanged(
  before: InstructionContextState | undefined,
  after: InstructionContextState
): boolean {
  const diff = diffInstructionStates(before, after);
  return diff.primaryChanged || diff.overrideChanged;
}

// ============================================================================
// Content loading & formatting
// ============================================================================

/**
 * Load the latest instruction content (full text) for re-injection.
 *
 * Called only when a change was detected — re-reads the primary (and override)
 * file and returns their current text. Content is intentionally not retained
 * on the state object; it is fetched on demand at injection time.
 */
export async function loadLatestInstructionContent(): Promise<{
  primary: { name: string; content: string; truncated: boolean } | undefined;
  override: { name: string; content: string; truncated: boolean } | undefined;
}> {
  const env = getEnv();

  for (const filename of INSTRUCTION_FILENAMES) {
    const filePath = env.path.join(env.rootPath, filename);
    try {
      const exists = await env.fs.exists(filePath);
      if (!exists) continue;

      const content = await env.fs.readFile(filePath);
      const overridePath = env.path.join(env.path.dirname(filePath), overrideFilename(filename));
      const override = await loadOverrideContent(overridePath);

      const primary = truncateContentWithFlag(content);
      return { primary: { name: filename, ...primary }, override };
    } catch {
      continue;
    }
  }

  return { primary: undefined, override: undefined };
}

/** Load override file content if present. */
async function loadOverrideContent(
  overridePath: string
): Promise<{ name: string; content: string; truncated: boolean } | undefined> {
  const env = getEnv();
  try {
    const exists = await env.fs.exists(overridePath);
    if (!exists) return undefined;
    const content = await env.fs.readFile(overridePath);
    return { name: env.path.basename(overridePath), ...truncateContentWithFlag(content) };
  } catch {
    return undefined;
  }
}

/**
 * Render the `<instruction_context>` section with the latest instruction
 * content and a supersede notice that replaces any stale `<project_instructions>`.
 *
 * @param loaded - Latest instruction content (from {@link loadLatestInstructionContent}).
 * @returns The rendered section, or undefined when no instruction files exist.
 */
export function formatInstructionContextSection(
  loaded: Awaited<ReturnType<typeof loadLatestInstructionContent>>
): string | undefined {
  if (!loaded.primary) return undefined;

  const parts: string[] = [];
  parts.push(
    "The project instruction files below changed since they were loaded into " +
      "<project_instructions> in the system prompt. Treat this block as authoritative " +
      "and ignore the older <project_instructions> content."
  );

  if (loaded.primary.truncated) {
    parts.push(
      `NOTE: ${loaded.primary.name} exceeds the ${INSTRUCTION_MAX_BYTES}-byte instruction budget and was truncated.`
    );
  }
  parts.push(`# ${loaded.primary.name}`);
  parts.push(loaded.primary.content);

  if (loaded.override) {
    if (loaded.override.truncated) {
      parts.push(
        `NOTE: ${loaded.override.name} exceeds the ${INSTRUCTION_MAX_BYTES}-byte instruction budget and was truncated.`
      );
    }
    parts.push(`## Local Override (${loaded.override.name})`);
    parts.push(loaded.override.content);
  }

  return [INSTRUCTION_CONTEXT_OPEN, ...parts, INSTRUCTION_CONTEXT_CLOSE].join("\n");
}
