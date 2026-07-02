/**
 * Memory Extractor - Background extraction and consolidation of memories.
 *
 * After each agent turn, this module analyzes recent conversation messages
 * and extracts new memories (user preferences, project facts, feedback).
 *
 * Uses the same subagent pattern as compaction summarization:
 * - No tools (pure extraction task)
 * - Single iteration
 * - Serialized conversation input (prevents tool-call contamination)
 *
 * @example
 * ```typescript
 * const count = await extractMemories(messages, memoryManager, "agent-123");
 * // Returns number of newly extracted memories
 *
 * await consolidateMemories(memoryManager, "agent-123");
 * // Merges/deduplicates when threshold exceeded
 * ```
 */

import { runSubagent } from "../subagent/runner.js";

import { DEFAULT_HARD_MAX_MEMORIES, MEMORY_TYPES } from "./types.js";

import type { MemoryManager } from "./memory-manager.js";
import type { Memory, MemoryType } from "./types.js";
import type { ModelMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Your role is to identify and extract \
important knowledge from conversation transcripts that should be remembered across sessions.

You extract:
- User preferences (coding style, tool choices, communication preferences)
- User corrections and feedback (things the user corrected or asked you to do differently)
- Project facts (architecture, conventions, dependencies, build commands)
- External references (URLs, docs, tools mentioned)

Rules:
- Only extract genuinely useful, reusable knowledge
- Do NOT extract task-specific details that are only relevant to the current task
- Do NOT duplicate information already covered by existing memories
- Keep descriptions concise (one line)
- Keep body content focused and specific
- Use kebab-case for names (e.g., "user-prefers-tabs")
- Return a JSON array, or [] if nothing new to extract`;

const CONSOLIDATION_SYSTEM_PROMPT = `You are a memory consolidation assistant. Your role is to merge, \
deduplicate, and clean up a collection of memory entries.

You will receive a lightweight catalog of all memories (filename, name, type, description — NO body).
Your job is to decide which memories to merge, delete, or keep.

Rules:
1. Merge memories that cover the same topic into a single entry. Provide the merged description and body.
2. Delete memories that are outdated, contradicted, or no longer useful.
3. Keep the total as small as possible — aim for under 30.
4. Preserve user preferences and feedback above all else.
5. Keep descriptions concise (one line).
6. Use kebab-case for names.

Return a JSON object:
{
  "merged": [
    { "name": "...", "type": "user|feedback|project|reference", "description": "...", "body": "...",
      "replaces": ["filename1.md", "filename2.md"] }
  ],
  "deleted": ["filename3.md", "filename4.md"]
}

- "merged": new memories that replace 2+ source files listed in "replaces".
  Write the full merged body yourself based on the descriptions.
- "deleted": files to remove outright (outdated/contradicted).
- Files not mentioned in either list are kept as-is.
- If no changes needed, return { "merged": [], "deleted": [] }.`;

/** Number of recent messages to analyze for extraction */
const EXTRACTION_WINDOW = 10;

/** Maximum characters of dialogue to send for extraction */
const MAX_EXTRACTION_CHARS = 4000;

/** Maximum characters of the lightweight catalog (frontmatter only) sent for consolidation */
const MAX_CONSOLIDATION_CATALOG_CHARS = 20000;

// ============================================================================
// Conversation Serialization
// ============================================================================

/**
 * Serialize recent messages to plain text for extraction.
 * Same technique as compaction: prevents tool-call contamination.
 */
function serializeForExtraction(messages: ModelMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = extractText(msg.content);
      if (text) parts.push(`user: ${text}`);
    } else if (msg.role === "assistant") {
      const text = extractText(msg.content);
      if (text) parts.push(`assistant: ${text}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Extract text content from a message's content field.
 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    const p = part as Record<string, unknown>;
    if (p.type === "text" && typeof p.text === "string") {
      parts.push(p.text);
    }
  }
  return parts.join("\n");
}

// ============================================================================
// Memory Extraction
// ============================================================================

interface ExtractedMemory {
  name: string;
  type: MemoryType;
  description: string;
  body: string;
}

/**
 * Extract new memories from recent conversation messages.
 *
 * Uses a subagent to analyze the last N messages and identify
 * new user preferences, project facts, and feedback.
 *
 * @param messages - Full conversation messages
 * @param memoryManager - MemoryManager instance for reading existing + writing new
 * @param parentAgentId - Parent agent ID for spawning subagent
 * @returns Number of newly extracted memories
 */
export async function extractMemories(
  messages: ModelMessage[],
  memoryManager: MemoryManager,
  parentAgentId: string
): Promise<number> {
  // Take only recent messages
  const recentMessages = messages.slice(-EXTRACTION_WINDOW);

  const dialogue = serializeForExtraction(recentMessages);
  if (!dialogue.trim()) return 0;

  // Get existing memories to avoid duplicates
  const existing = await memoryManager.listMemories();
  const existingDesc = existing.length > 0 ? existing.map((m) => `- ${m.name}: ${m.description}`).join("\n") : "(none)";

  const validTypes = MEMORY_TYPES.join(", ");

  const prompt = [
    "Extract user preferences, constraints, or project facts from this dialogue.",
    `Return a JSON array. Each item: {name, type, description, body}.`,
    `- name: short kebab-case identifier (e.g. "user-preference-tabs")`,
    `- type: one of ${validTypes}`,
    "- description: one-line summary for index lookup",
    "- body: full detail in markdown",
    "If nothing new or already covered by existing memories, return [].",
    "",
    `Existing memories:\n${existingDesc}`,
    "",
    `Dialogue:\n${dialogue.slice(0, MAX_EXTRACTION_CHARS)}`,
  ].join("\n");

  const result = await runSubagent({
    prompt,
    parentAgentId,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    tools: {},
    maxIterations: 1,
    maxOutputLength: 2000,
    retryOnEmpty: false,
    autoDestroy: true,
    aggregateUsageToParent: true,
    description: "memory-extract",
  });

  // Parse JSON array from response
  const items = parseJsonArray(result.output);
  if (!items || items.length === 0) return 0;

  let count = 0;
  for (const item of items) {
    const mem = item as Partial<ExtractedMemory>;
    const name = typeof mem.name === "string" ? mem.name : "";
    const type = isValidMemoryType(mem.type) ? mem.type : "user";
    const description = typeof mem.description === "string" ? mem.description : "";
    const body = typeof mem.body === "string" ? mem.body : "";

    if (name && description && body) {
      await memoryManager.writeMemory(name, type, description, body);
      count++;
    }
  }

  return count;
}

// ============================================================================
// Memory Consolidation
// ============================================================================

export interface ConsolidationResult {
  /** Whether the consolidation actually modified anything */
  changed: boolean;
  /** Number of memories after consolidation */
  count: number;
}

/**
 * Consolidate memories when the count exceeds the threshold.
 *
 * Two-phase approach:
 * 1. LLM consolidation — send a lightweight catalog (frontmatter only, no
 *    bodies) so the LLM can see ALL memories without hitting token limits.
 *    The LLM returns merge/delete decisions. For merges, it writes the merged
 *    body from the descriptions.
 * 2. Hard-cap eviction — if the count still exceeds {@link DEFAULT_HARD_MAX_MEMORIES}
 *    after LLM consolidation, evict the oldest memories (by updatedAt) until
 *    under the cap.
 *
 * @param memoryManager - MemoryManager instance
 * @param parentAgentId - Parent agent ID for spawning subagent
 * @returns Consolidation result with changed flag and final count
 */
export async function consolidateMemories(
  memoryManager: MemoryManager,
  parentAgentId: string
): Promise<ConsolidationResult> {
  const memories = await memoryManager.listMemories();
  if (memories.length < memoryManager.getConsolidateThreshold()) {
    return { changed: false, count: memories.length };
  }

  // Phase 1: LLM consolidation via lightweight catalog (frontmatter only).
  // This avoids the token-truncation problem where sending full bodies would
  // exceed the context and cause the LLM to only see a subset of memories.
  const llmChanged = await llmConsolidate(memories, memoryManager, parentAgentId);

  // Phase 2: Hard-cap eviction. If LLM consolidation didn't reduce enough,
  // evict oldest memories by updatedAt to stay under the hard limit.
  const postLlmMemories = llmChanged ? await memoryManager.listMemories() : memories;
  const evicted = await evictOldest(postLlmMemories, memoryManager);

  const changed = llmChanged || evicted > 0;
  const finalCount = postLlmMemories.length - evicted;
  return { changed, count: changed ? finalCount : memories.length };
}

/**
 * Phase 1: LLM-driven consolidation using a lightweight frontmatter-only catalog.
 *
 * Returns true if any files were written or deleted.
 */
async function llmConsolidate(
  memories: Memory[],
  memoryManager: MemoryManager,
  parentAgentId: string
): Promise<boolean> {
  // Build a lightweight catalog: filename + name + type + description (no body).
  // 59 memories × ~80 chars each ≈ 5KB — well within token limits.
  const catalog = memories.map((m) => `- ${m.filename} | ${m.type} | ${m.name} | ${m.description}`).join("\n");

  const prompt = [
    "Below is a catalog of all memory files (filename | type | name | description).",
    "Decide which to merge, delete, or keep.",
    "",
    catalog.slice(0, MAX_CONSOLIDATION_CATALOG_CHARS),
  ].join("\n");

  const result = await runSubagent({
    prompt,
    parentAgentId,
    systemPrompt: CONSOLIDATION_SYSTEM_PROMPT,
    tools: {},
    maxIterations: 1,
    maxOutputLength: 8000,
    retryOnEmpty: false,
    autoDestroy: true,
    aggregateUsageToParent: true,
    description: "memory-consolidate",
  });

  const decisions = parseConsolidationResponse(result.output);
  if (!decisions) return false;

  let changed = false;
  const allReplaced = new Set<string>();
  const allDeleted = new Set<string>();

  // Write merged memories
  for (const merge of decisions.merged) {
    if (!merge.name || !merge.description || !merge.body) continue;
    await memoryManager.writeMemory(merge.name, merge.type, merge.description, merge.body);
    for (const f of merge.replaces) {
      allReplaced.add(f);
    }
    changed = true;
  }

  // Collect deletions
  for (const f of decisions.deleted) {
    allDeleted.add(f);
  }

  // Delete replaced and explicitly-deleted files
  for (const filename of [...allReplaced, ...allDeleted]) {
    const exists = memories.some((m) => m.filename === filename);
    if (exists) {
      await memoryManager.deleteMemory(filename);
      changed = true;
    }
  }

  return changed;
}

/**
 * Phase 2: Evict oldest memories (by updatedAt) until under the hard cap.
 *
 * Returns the number of evicted files.
 */
async function evictOldest(memories: Memory[], memoryManager: MemoryManager): Promise<number> {
  if (memories.length <= DEFAULT_HARD_MAX_MEMORIES) return 0;

  // Sort by updatedAt (oldest first). Fall back to createdAt, then filename.
  const sorted = [...memories].sort((a, b) => {
    const ta = a.updatedAt ?? a.createdAt ?? "";
    const tb = b.updatedAt ?? b.createdAt ?? "";
    return ta.localeCompare(tb);
  });

  const toEvict = sorted.slice(0, sorted.length - DEFAULT_HARD_MAX_MEMORIES);
  for (const m of toEvict) {
    await memoryManager.deleteMemory(m.filename);
  }
  return toEvict.length;
}

// ============================================================================
// Helpers
// ============================================================================

interface ConsolidationDecisions {
  merged: Array<{
    name: string;
    type: MemoryType;
    description: string;
    body: string;
    replaces: string[];
  }>;
  deleted: string[];
}

/**
 * Parse the LLM's consolidation response.
 *
 * Expected format: { "merged": [...], "deleted": ["f.md", ...] }
 */
function parseConsolidationResponse(text: string): ConsolidationDecisions | null {
  if (!text.trim()) return null;

  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Partial<ConsolidationDecisions>;
    const merged = Array.isArray(parsed.merged) ? parsed.merged : [];
    const deleted = Array.isArray(parsed.deleted) ? parsed.deleted : [];

    return {
      merged: merged
        .filter((m): m is NonNullable<typeof m> => m != null)
        .map((m) => ({
          name: typeof m.name === "string" ? m.name.trim() : "",
          type: isValidMemoryType(m.type) ? m.type : "user",
          description: typeof m.description === "string" ? m.description.trim() : "",
          body: typeof m.body === "string" ? m.body.trim() : "",
          replaces: Array.isArray(m.replaces) ? m.replaces.filter((f): f is string => typeof f === "string") : [],
        }))
        .filter((m) => m.name && m.description && m.body),
      deleted: deleted.filter((f): f is string => typeof f === "string"),
    };
  } catch {
    return null;
  }
}

function isValidMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}

/**
 * Parse a JSON array from LLM output. Handles markdown code fences.
 * Used by extractMemories (not consolidation, which uses parseConsolidationResponse).
 */
function parseJsonArray(text: string): unknown[] | null {
  if (!text.trim()) return null;

  // Try to find JSON array in the response
  const match = /\[[\s\S]*\]/.exec(text);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
