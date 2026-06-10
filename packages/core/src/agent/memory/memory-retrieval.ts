/**
 * Memory Retrieval - Intelligent on-demand memory loading.
 *
 * Each user turn, this module selects the most relevant memories using an
 * LLM side-query (with keyword fallback) and returns their full content
 * for injection into the agent's context.
 *
 * Design follows Claude Code's `findRelevantMemories` pattern:
 * 1. Scan — list all memory files (frontmatter only)
 * 2. Filter — exclude memories already surfaced this session
 * 3. Select — LLM side-query picks top 5 by name+description
 * 4. Load — read full body of selected memories (with budget caps)
 * 5. Format — produce injectable text for system prompt
 *
 * @example
 * ```typescript
 * const relevant = await findRelevantMemories("How do I indent?", manager, model);
 * const injected = formatRelevantMemories(relevant);
 * // injected string goes into buildSystemPrompt()
 * ```
 */

import { generateText } from "ai";

import {
  DEFAULT_MAX_MEMORY_BYTES_PER_FILE,
  DEFAULT_MAX_MEMORY_LINES_PER_FILE,
  DEFAULT_MAX_RELEVANT_MEMORIES,
  DEFAULT_MAX_SESSION_MEMORY_BYTES,
} from "./types.js";

import type { MemoryManager } from "./memory-manager.js";
import type { Memory } from "./types.js";
import type { LanguageModel } from "ai";

// ============================================================================
// Types
// ============================================================================

export interface RelevantMemory {
  filename: string;
  name: string;
  type: string;
  description: string;
  content: string;
}

export interface FindRelevantMemoriesOptions {
  maxItems?: number;
  maxBytesPerFile?: number;
  maxLinesPerFile?: number;
  maxSessionBytes?: number;
}

// ============================================================================
// Constants
// ============================================================================

const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful \
to an AI coding agent as it processes a user's query. \
Select memories you are CERTAIN will be relevant to the query — when in doubt, do not select.

Rules:
- Return a JSON object: { "selected_memories": ["filename1.md", "filename2.md"] }
- Select at most 5 memories
- Only select memories whose description clearly relates to the query
- If none are relevant, return { "selected_memories": [] }`;

// ============================================================================
// Manifest Formatting
// ============================================================================

/**
 * Format a memory catalog for the LLM selector.
 * Each line: `[type] filename (timestamp): description`
 */
function formatManifest(memories: Memory[]): string {
  return memories
    .map((m) => {
      const ts = m.updatedAt ?? m.createdAt ?? "";
      const tsLabel = ts ? ` (${ts})` : "";
      return `[${m.type}] ${m.filename}${tsLabel}: ${m.description}`;
    })
    .join("\n");
}

// ============================================================================
// Content Budget Enforcement
// ============================================================================

/**
 * Truncate memory body to per-file budget (lines and bytes).
 */
function truncateBody(
  body: string,
  maxLines: number = DEFAULT_MAX_MEMORY_LINES_PER_FILE,
  maxBytes: number = DEFAULT_MAX_MEMORY_BYTES_PER_FILE
): string {
  let result = body;

  const lines = result.split("\n");
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n") + "\n[truncated: exceeded line limit]";
  }

  const bytes = Buffer.byteLength(result, "utf-8");
  if (bytes > maxBytes) {
    // Binary-search for the right cut point that fits
    let lo = 0;
    let hi = result.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (Buffer.byteLength(result.slice(0, mid), "utf-8") <= maxBytes - 30) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    result = result.slice(0, lo) + "\n[truncated: exceeded byte limit]";
  }

  return result;
}

// ============================================================================
// LLM Selection
// ============================================================================

/**
 * Use a lightweight LLM call to select relevant memories from the manifest.
 */
async function selectWithLLM(query: string, manifest: string, model: LanguageModel): Promise<string[]> {
  const result = await generateText({
    model,
    system: SELECT_MEMORIES_SYSTEM_PROMPT,
    prompt: `Query: ${query}\n\nAvailable memories:\n${manifest}`,
    maxOutputTokens: 256,
  });

  const match = /\{[\s\S]*?\}/.exec(result.text);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as { selected_memories?: unknown };
    if (Array.isArray(parsed.selected_memories)) {
      return parsed.selected_memories.filter((f: unknown): f is string => typeof f === "string");
    }
  } catch {
    // JSON parse failed — fall through to empty
  }

  return [];
}

// ============================================================================
// Keyword Fallback
// ============================================================================

/**
 * Simple keyword matching fallback when LLM selection fails.
 * Scores each memory by how many query words appear in name + description.
 */
function selectWithKeywords(query: string, memories: Memory[], maxItems: number): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (words.length === 0) return [];

  const scored = memories.map((m) => {
    const text = `${m.name} ${m.description} ${m.type}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score++;
    }
    return { filename: m.filename, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((s) => s.filename);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Find and load memories relevant to the current query.
 *
 * 1. Lists all memories from MemoryManager
 * 2. Filters out `alreadySurfaced` filenames
 * 3. Runs LLM side-query to select top N (with keyword fallback)
 * 4. Loads full body of selected memories (with per-file and session budget caps)
 *
 * @param query - The user's current query/message
 * @param memoryManager - MemoryManager instance for listing/reading
 * @param model - LanguageModel for the selection side-query (null = keyword only)
 * @param alreadySurfaced - Set of filenames already shown this session
 * @param options - Budget and limit overrides
 * @returns Array of relevant memories with truncated full content
 */
export async function findRelevantMemories(
  query: string,
  memoryManager: MemoryManager,
  model: LanguageModel | null,
  alreadySurfaced: ReadonlySet<string> = new Set(),
  options: FindRelevantMemoriesOptions = {}
): Promise<RelevantMemory[]> {
  const {
    maxItems = DEFAULT_MAX_RELEVANT_MEMORIES,
    maxBytesPerFile = DEFAULT_MAX_MEMORY_BYTES_PER_FILE,
    maxLinesPerFile = DEFAULT_MAX_MEMORY_LINES_PER_FILE,
    maxSessionBytes = DEFAULT_MAX_SESSION_MEMORY_BYTES,
  } = options;

  const allMemories = await memoryManager.listMemories();

  // Pre-filter already-surfaced before LLM call (don't waste slots on repeats)
  const candidates = allMemories.filter((m) => !alreadySurfaced.has(m.filename));
  if (candidates.length === 0) return [];

  const manifest = formatManifest(candidates);

  // Select relevant filenames — LLM with keyword fallback
  let selectedFilenames: string[];
  if (model) {
    try {
      selectedFilenames = await selectWithLLM(query, manifest, model);
    } catch {
      selectedFilenames = selectWithKeywords(query, candidates, maxItems);
    }
  } else {
    selectedFilenames = selectWithKeywords(query, candidates, maxItems);
  }

  if (selectedFilenames.length === 0) return [];

  // Resolve filenames → Memory objects, load content with budget enforcement
  const candidateMap = new Map(candidates.map((m) => [m.filename, m]));
  const results: RelevantMemory[] = [];
  let totalBytes = 0;

  for (const filename of selectedFilenames.slice(0, maxItems)) {
    const mem = candidateMap.get(filename);
    if (!mem) continue;

    const content = truncateBody(mem.body, maxLinesPerFile, maxBytesPerFile);
    const contentBytes = Buffer.byteLength(content, "utf-8");

    // Enforce session-level budget
    if (totalBytes + contentBytes > maxSessionBytes) break;
    totalBytes += contentBytes;

    results.push({
      filename: mem.filename,
      name: mem.name,
      type: mem.type,
      description: mem.description,
      content,
    });
  }

  return results;
}

// ============================================================================
// Formatting for Injection
// ============================================================================

/**
 * Format relevant memories into injectable text for the system prompt.
 *
 * Uses XML tags (`<relevant_memories>`, `<memory>`) to provide unambiguous
 * boundaries so markdown content inside memories (headings, code fences,
 * `---` separators) doesn't bleed into the surrounding system prompt structure.
 *
 * Returns empty string if no memories are provided.
 */
export function formatRelevantMemories(memories: RelevantMemory[]): string {
  if (memories.length === 0) return "";

  const parts = memories.map(
    (m) => `<memory name="${m.name}" type="${m.type}">\n${m.description}\n\n${m.content}\n</memory>`
  );

  return [
    "<relevant_memories>",
    "The following memories were selected as relevant to the current conversation.",
    "Apply any user preferences, project facts, or conventions described below.",
    "",
    parts.join("\n\n"),
    "</relevant_memories>",
  ].join("\n");
}
