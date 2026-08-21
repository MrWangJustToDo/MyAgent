/**
 * Built-in Skills extension — exposes SKILL.md domain knowledge to the agent.
 *
 * Provides:
 * - `list_skills` tool: list available skills (name + description)
 * - `load_skill` tool: load the full SKILL.md content for a skill
 * - Turn-context injection of the available-skills index into `<extension_context>`
 *   (progressive disclosure: only names + descriptions are always visible; the
 *   full body is loaded on demand via `load_skill`).
 *
 * Skills are discovered from the directories passed to the injected
 * `SkillRegistry` (see `getDefaultSkillDirs`). The extension registers no
 * scripts/assets; skill content may reference relative paths resolved by the
 * agent's own fs tools.
 *
 * Runtime-agnostic: all I/O goes through the injected `SkillRegistry`, which
 * uses the global CoreEnv (`getEnv()`).
 */

import type { SkillRegistry } from "./skill-registry.js";
import type { ExtensionAPI, ExtensionContext } from "../extension/types.js";

// ============================================================================
// Config
// ============================================================================

/** Fine-grained configuration for the built-in skills extension. */
export interface SkillsExtensionConfig {
  /**
   * Disable the on-demand tools (list_skills/load_skill) and only inject the
   * index into turn context. Default: false (tools registered).
   */
  toolsDisabled?: boolean;
  /**
   * Disable injecting the skills index into turn context. Default: false
   * (index injected when skills exist).
   */
  indexDisabled?: boolean;
}

// ============================================================================
// Extension factory
// ============================================================================

export interface CreateSkillsExtensionOptions {
  /** Pre-loaded skill registry (created + populated by the agent factory). */
  skillRegistry: SkillRegistry;
  /** Fine-grained config. */
  config?: SkillsExtensionConfig;
}

/** Create the built-in Skills extension (default export kept for interop). */
export function createSkillsExtension(options: CreateSkillsExtensionOptions): ExtensionAPI {
  return skillsExtension(options);
}

/** The built-in Skills extension factory (matches ExtensionFactory shape). */
export function skillsExtension(options: CreateSkillsExtensionOptions): ExtensionAPI {
  const { skillRegistry, config } = options;
  return {
    id: "my-agent-skills",
    name: "Skills",
    version: "1.0.0",
    description:
      "SKILL.md domain knowledge: list_skills/load_skill tools + available-skills index injected into turn context",
    async activate(ctx) {
      await activateSkills(ctx, skillRegistry, config);
    },
  };
}

export default skillsExtension;

async function activateSkills(
  ctx: ExtensionContext,
  skillRegistry: SkillRegistry,
  config?: SkillsExtensionConfig
): Promise<void> {
  const z = ctx.z;

  if (config?.toolsDisabled !== true) {
    ctx.registerTool({
      name: "list_skills",
      description: `List available skills (name + brief description).

Prefer the <skills> index already in the turn context. Call this only to refresh the list.
Then use load_skill to load the full content of a specific skill.`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        skills: z.array(z.object({ name: z.string(), description: z.string() })),
        count: z.number(),
      }),
      execute: async () => {
        const skills = skillRegistry.list();
        return {
          skills,
          count: skills.length,
        };
      },
      // Only send skills to the LLM — count is derived, avoid extra tokens.
      toModelOutput({ output }) {
        const { skills } = output as { skills?: Array<{ name: string; description: string }> };
        const lines = skills?.map((s) => `- ${s.name}: ${s.description}`) ?? [];
        return `Available skills:\n${lines.join("\n")}`;
      },
    });

    ctx.registerTool({
      name: "load_skill",
      description: `Load the full content of a skill by name.

Use this after list_skills (or the <skills> index) to load specific domain knowledge.
The skill content will be returned wrapped in <skill name="..."> tags.

Skills contain specialized instructions, workflows, or domain expertise
that help you complete specific types of tasks.`,
      inputSchema: z.object({
        name: z.string().describe("The name of the skill to load"),
      }),
      outputSchema: z.object({
        name: z.string(),
        content: z.string(),
      }),
      execute: async (input) => {
        const { name } = (input ?? {}) as { name?: string };
        const skill = skillRegistry.get(String(name));
        if (!skill) {
          const available = skillRegistry.names();
          const availableList =
            available.length > 0 ? `Available skills: ${available.join(", ")}` : "No skills are currently loaded.";
          throw new Error(`Unknown skill '${String(name)}'. ${availableList}`);
        }
        const content = `<skill name="${skill.name}">\n${skill.body}\n</skill>`;
        return { name: skill.name, content };
      },
      // Only send content to the LLM — name is echoed in the input.
      toModelOutput({ output }) {
        return (output as { content: string }).content;
      },
    });
  }

  // Inject the available-skills index into per-turn context (progressive disclosure).
  if (config?.indexDisabled !== true) {
    ctx.registerTurnContextProvider(() => {
      if (skillRegistry.size === 0) return undefined;
      const lines = skillRegistry.list().map((s) => `- ${s.name}: ${s.description}`);
      return [
        "<skills>",
        "Use `load_skill` to load any of these skills when relevant to the user's task.",
        "The index lists name + description summaries only — do not infer or follow a skill's instructions until its full content has been loaded via `load_skill`.",
        "",
        ...lines,
        "</skills>",
      ].join("\n");
    });
  }

  // `/skill <name>` — load a skill by expanding its full body into the session as a
  // user message, driving the agent to act on the skill (opencode-style command).
  ctx.registerCommand({
    name: "skill",
    description: "Load a skill and let the agent act on it: /skill <name>. With no name, lists available skills.",
    getOptions: () =>
      skillRegistry.list().map((s) => ({
        label: s.name,
        value: s.name,
        description: s.description,
      })),
    execute: async (args) => {
      const name = args[0]?.trim();
      if (!name) {
        const available = skillRegistry.names();
        return available.length > 0 ? `Available skills: ${available.join(", ")}` : "No skills are currently loaded.";
      }
      const skill = skillRegistry.get(name);
      if (!skill) {
        const available = skillRegistry.names();
        const availableList =
          available.length > 0 ? `Available skills: ${available.join(", ")}` : "No skills are currently loaded.";
        return `Unknown skill '${name}'. ${availableList}`;
      }
      return `Loaded skill '${skill.name}'. Agent will now act on it.`;
    },
    // Inject the full skill body into the session so the agent sees the
    // workflow and acts on it (matches opencode's skill-as-command template).
    // Any text appended after /skill <name> is merged into the injected message
    // so the user can specify what they want done with the skill.
    injectMessage: async (args) => {
      const name = args[0]?.trim();
      if (!name) return undefined;
      const skill = skillRegistry.get(name);
      if (!skill) return undefined;
      const followup = args.slice(1).join(" ").trim();
      const body = `<skill name="${skill.name}">\n${skill.body}\n</skill>`;
      if (!followup) return body;
      return `${body}\n\nUser request with this skill:\n${followup}`;
    },
  });

  ctx.logger.info(`Skills extension activated (${skillRegistry.size} skills)`);
}
