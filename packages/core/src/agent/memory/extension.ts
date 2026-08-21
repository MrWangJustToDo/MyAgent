/**
 * Built-in Memory extension — exposes persistent cross-session memories to the agent.
 *
 * Provides:
 * - `memory_list` tool: list memory files (name + description from the index)
 * - `memory_read` tool: read the full content of a specific memory
 * - `memory_write` tool: create / update a memory (user preference, project fact, ...)
 * - Turn-context injection of the MEMORY.md index into `<extension_context>`
 *   (progressive disclosure: names + descriptions are always visible; the full
 *   body is loaded on demand via `memory_read`).
 *
 * The per-turn relevance query (top-N memories by current user message) and the
 * end-of-turn extraction/consolidation remain in the run lifecycle
 * (`MemoryService`), driven by the same injected `MemoryManager`. This extension
 * only owns the *presentation* layer: tools, index injection, and the `/memory`
 * command — matching how `my-agent-skills` wraps `SkillRegistry`.
 *
 * Runtime-agnostic: all I/O goes through the injected `MemoryManager`, which
 * uses the global CoreEnv (`getEnv()`).
 */

import type { MemoryManager } from "./memory-manager.js";
import type { ExtensionAPI, ExtensionContext } from "../extension/types.js";

// ============================================================================
// Config
// ============================================================================

/** Fine-grained configuration for the built-in memory extension. */
export interface MemoryExtensionConfig {
  /**
   * Disable the on-demand tools (memory_list/memory_read/memory_write) and only
   * inject the index into turn context. Default: false (tools registered).
   */
  toolsDisabled?: boolean;
  /**
   * Disable injecting the memory index into turn context. Default: false
   * (index injected when memories exist).
   */
  indexDisabled?: boolean;
}

// ============================================================================
// Extension factory
// ============================================================================

export interface CreateMemoryExtensionOptions {
  /** Pre-initialized memory manager (created by the agent factory). */
  memoryManager: MemoryManager;
  /** Fine-grained config. */
  config?: MemoryExtensionConfig;
}

/** Create the built-in Memory extension (default export kept for interop). */
export function createMemoryExtension(options: CreateMemoryExtensionOptions): ExtensionAPI {
  return memoryExtension(options);
}

/** The built-in Memory extension factory (matches ExtensionFactory shape). */
export function memoryExtension(options: CreateMemoryExtensionOptions): ExtensionAPI {
  const { memoryManager, config } = options;
  return {
    id: "my-agent-memory",
    name: "Memory",
    version: "1.0.0",
    description:
      "Persistent cross-session memories: memory_list/memory_read/memory_write tools + MEMORY.md index injected into turn context",
    async activate(ctx) {
      await activateMemory(ctx, memoryManager, config);
    },
  };
}

export default memoryExtension;

async function activateMemory(
  ctx: ExtensionContext,
  memoryManager: MemoryManager,
  config?: MemoryExtensionConfig
): Promise<void> {
  const z = ctx.z;

  if (config?.toolsDisabled !== true) {
    ctx.registerTool({
      name: "memory_list",
      description: `List available memories (name + type + description).

Memories are durable facts extracted from previous sessions (user preferences,
project conventions, decisions). The <memory_index> in turn context already
lists them; call this to refresh or enumerate with type/filename detail.`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        memories: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            description: z.string(),
            filename: z.string(),
          })
        ),
        count: z.number(),
      }),
      execute: async () => {
        const memories = await memoryManager.listMemories();
        return {
          memories: memories.map((m) => ({
            name: m.name,
            type: m.type,
            description: m.description,
            filename: m.filename,
          })),
          count: memories.length,
        };
      },
      // Only send the readable summary to the LLM — filename is derived, avoid extra tokens.
      toModelOutput({ output }) {
        const list = output as { memories?: Array<{ name: string; type: string; description: string }> };
        const lines = list?.memories?.map((m) => `- [${m.type}] ${m.name}: ${m.description}`) ?? [];
        return lines.length > 0 ? `Available memories:\n${lines.join("\n")}` : "No memories stored.";
      },
    });

    ctx.registerTool({
      name: "memory_read",
      description: `Read the full content of a memory by name or filename.

Use after memory_list (or the <memory_index>) to load the full body of a specific
memory. Returns the memory wrapped in <memory> tags.`,
      inputSchema: z.object({
        name: z.string().describe("The memory name or filename to read"),
      }),
      outputSchema: z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
        content: z.string(),
      }),
      execute: async (input) => {
        const { name } = (input ?? {}) as { name?: string };
        const memories = await memoryManager.listMemories();
        const match =
          memories.find((m) => m.name === String(name)) ??
          memories.find((m) => m.filename === String(name)) ??
          memories.find((m) => m.filename.replace(/\.md$/, "") === String(name));
        if (!match) {
          const available =
            memories.length > 0
              ? `Available memories: ${memories.map((m) => m.name).join(", ")}`
              : "No memories are currently stored.";
          throw new Error(`Unknown memory '${String(name)}'. ${available}`);
        }
        const content = `<memory name="${match.name.replace(/"/g, "&quot;")}" type="${match.type}">\n${match.description}\n\n${match.body}\n</memory>`;
        return { name: match.name, type: match.type, description: match.description, content };
      },
      // Only send content to the LLM — name is echoed in the input.
      toModelOutput({ output }) {
        return (output as { content: string }).content;
      },
    });

    ctx.registerTool({
      name: "memory_write",
      description: `Write a durable memory to persist knowledge across sessions.

Use for user preferences, corrections, project facts, decisions, and external
references worth remembering later. Prefer updating an existing memory over
creating a duplicate (check memory_list first).`,
      inputSchema: z.object({
        name: z.string().describe("Short kebab-case identifier (e.g. user-prefers-tabs)"),
        type: z.enum(["user", "feedback", "project", "reference"]).describe("Memory category"),
        description: z.string().describe("One-line summary for the index"),
        body: z.string().describe("Full detail in markdown"),
      }),
      outputSchema: z.object({
        filename: z.string(),
        ok: z.boolean(),
      }),
      execute: async (input) => {
        const { name, type, description, body } = (input ?? {}) as {
          name?: string;
          type?: "user" | "feedback" | "project" | "reference";
          description?: string;
          body?: string;
        };
        const filename = await memoryManager.writeMemory(
          String(name),
          String(type) as "user" | "feedback" | "project" | "reference",
          String(description),
          String(body)
        );
        return { filename, ok: true };
      },
      toModelOutput({ output }) {
        return `Memory saved to ${(output as { filename: string }).filename}.`;
      },
    });
  }

  // Inject the memory index into per-turn context (progressive disclosure).
  if (config?.indexDisabled !== true) {
    ctx.registerTurnContextProvider(() => {
      const index = memoryManager.getIndexContent();
      if (!index.trim()) return undefined;
      return [
        "<memory_index>",
        "These are memories from previous sessions. Respect user preferences from memory.",
        "When the user says 'remember' or expresses a clear preference, it will be automatically extracted.",
        "",
        index.trim(),
        "</memory_index>",
      ].join("\n");
    });
  }

  // `/memory` — list or read a memory. Listing needs no model turn; reading a
  // specific memory injects its full body into the session (drives the agent).
  ctx.registerCommand({
    name: "memory",
    description: "List memories, or load one by name: /memory [<name>]. With no name, lists all memories.",
    getOptions: async () => {
      const memories = await memoryManager.listMemories();
      return memories.map((m) => ({
        label: m.name,
        value: m.name,
        description: m.description,
      }));
    },
    execute: async (args) => {
      const name = args[0]?.trim();
      const memories = await memoryManager.listMemories();
      if (!name) {
        if (memories.length === 0) return "No memories are currently stored.";
        return memories.map((m) => `- [${m.type}] ${m.name}: ${m.description}`).join("\n");
      }
      const match =
        memories.find((m) => m.name === name) ??
        memories.find((m) => m.filename === name) ??
        memories.find((m) => m.filename.replace(/\.md$/, "") === name);
      if (!match) {
        const available =
          memories.length > 0 ? `Available memories: ${memories.map((m) => m.name).join(", ")}` : "none";
        return `Unknown memory '${name}'. ${available}`;
      }
      return `Loaded memory '${match.name}'. Agent will now act on it.`;
    },
    // Inject the full memory body into the session so the agent sees it.
    // Any text appended after /memory <name> is merged into the injected message
    // so the user can specify what they want done with the memory.
    injectMessage: async (args) => {
      const name = args[0]?.trim();
      if (!name) return undefined;
      const memories = await memoryManager.listMemories();
      const match =
        memories.find((m) => m.name === name) ??
        memories.find((m) => m.filename === name) ??
        memories.find((m) => m.filename.replace(/\.md$/, "") === name);
      if (!match) return undefined;
      const followup = args.slice(1).join(" ").trim();
      const body = `<memory name="${match.name.replace(/"/g, "&quot;")}" type="${match.type}">\n${match.description}\n\n${match.body}\n</memory>`;
      if (!followup) return body;
      return `${body}\n\nUser request with this memory:\n${followup}`;
    },
  });

  ctx.logger.info(
    `Memory extension activated (${memoryManager.getIndexContent().trim() ? "index ready" : "empty index"})`
  );
}
