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

import { MEMORY_TYPES } from "./types.js";

import type { MemoryManager } from "./memory-manager.js";
import type { MemoryType } from "./types.js";
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
deduplicate, and clean up a collection of memory files.

Rules:
1. Merge duplicates into a single, comprehensive memory
2. Remove outdated or contradicted memories (keep the newer version)
3. Keep total under 30 memories
4. Preserve user preferences above all else
5. Keep descriptions concise (one line)
6. Use kebab-case for names
7. Return a JSON array with the consolidated memories`;

/** Number of recent messages to analyze for extraction */
const EXTRACTION_WINDOW = 10;

/** Maximum characters of dialogue to send for extraction */
const MAX_EXTRACTION_CHARS = 4000;

/** Maximum characters of catalog to send for consolidation */
const MAX_CONSOLIDATION_CHARS = 16000;

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

/**
 * Consolidate memories when the count exceeds the threshold.
 *
 * Uses a subagent to merge duplicates, remove outdated entries,
 * and keep the total under a reasonable limit.
 *
 * @param memoryManager - MemoryManager instance
 * @param parentAgentId - Parent agent ID for spawning subagent
 * @returns Number of memories after consolidation (0 if not triggered)
 */
export async function consolidateMemories(memoryManager: MemoryManager, parentAgentId: string): Promise<number> {
  const memories = await memoryManager.listMemories();
  if (memories.length < memoryManager.getConsolidateThreshold()) return 0;

  const catalog = memories
    .map((m) => `## ${m.filename}\nname: ${m.name}\ntype: ${m.type}\ndescription: ${m.description}\n${m.body}`)
    .join("\n\n");

  const prompt = [
    "Consolidate the following memory files. Rules:",
    "1. Merge duplicates into one",
    "2. Remove outdated/contradicted memories",
    "3. Keep the total under 30 memories",
    "4. Preserve important user preferences above all",
    `Return a JSON array. Each item: {name, type, description, body}.`,
    "",
    catalog.slice(0, MAX_CONSOLIDATION_CHARS),
  ].join("\n");

  const result = await runSubagent({
    prompt,
    parentAgentId,
    systemPrompt: CONSOLIDATION_SYSTEM_PROMPT,
    tools: {},
    maxIterations: 1,
    maxOutputLength: 5000,
    retryOnEmpty: false,
    autoDestroy: true,
    aggregateUsageToParent: true,
    description: "memory-consolidate",
  });

  const items = parseJsonArray(result.output);
  if (!items || items.length === 0) return memories.length;

  // Validate all items first — only delete if at least one can be written back
  const validated = items
    .map((item) => {
      const mem = item as Partial<ExtractedMemory>;
      return {
        name: typeof mem.name === "string" ? mem.name.trim() : "",
        type: isValidMemoryType(mem.type) ? mem.type : "user",
        description: typeof mem.description === "string" ? mem.description.trim() : "",
        body: typeof mem.body === "string" ? mem.body.trim() : "",
      };
    })
    .filter((v) => v.name && v.description && v.body);

  if (validated.length === 0) {
    return memories.length; // Nothing valid to write — keep existing memories
  }

  // Delete all existing memories, then write consolidated ones
  await memoryManager.deleteAllMemories();

  for (const { name, type, description, body } of validated) {
    await memoryManager.writeMemory(name, type, description, body);
  }

  return validated.length;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a JSON array from LLM output. Handles markdown code fences.
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

function isValidMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}
