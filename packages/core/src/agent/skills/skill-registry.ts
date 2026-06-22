/**
 * SkillRegistry - Manages loaded skills and provides lookup methods.
 *
 * Central registry for skills loaded from multiple directories.
 * Provides methods for listing available skills and loading specific ones.
 *
 * @example
 * ```typescript
 * const registry = new SkillRegistry({ rootPath: "/project", logger });
 * await registry.loadFromDirectories([".opencode/skills"], "/project/root");
 *
 * // List available skills
 * const skills = registry.list();
 *
 * // Get a specific skill
 * const skill = registry.get("git-workflow");
 * ```
 */

import { SkillLoader } from "./skill-loader.js";

import type { Skill, SkillSummary } from "./types.js";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// Types
// ============================================================================

export interface SkillRegistryConfig {
  /** Root path for resolving relative paths */
  rootPath: string;
  /** Optional logger for warnings and debug info */
  logger?: AgentLog;
}

// ============================================================================
// SkillRegistry Class
// ============================================================================

/**
 * Central registry for managing loaded skills.
 */
export class SkillRegistry {
  private rootPath: string;
  private logger?: AgentLog;
  private skills: Map<string, Skill> = new Map();
  private loader: SkillLoader;

  constructor(config: SkillRegistryConfig) {
    this.rootPath = config.rootPath;
    this.logger = config.logger;
    this.loader = new SkillLoader({
      rootPath: config.rootPath,
      logger: config.logger,
    });
  }

  /**
   * Load skills from multiple directories.
   *
   * Paths are relative to rootPath or absolute.
   * First loaded skill wins in case of name conflicts.
   *
   * @param dirs - Array of directory paths (relative to rootPath or absolute)
   */
  async loadFromDirectories(dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      // Normalize: remove leading ./ if present
      const normalizedPath = dir.startsWith("./") ? dir.slice(2) : dir;

      const dirSkills = await this.loader.loadFromDirectory(normalizedPath);

      // Add skills to registry, first loaded wins
      for (const [name, skill] of dirSkills) {
        if (this.skills.has(name)) {
          this.logger?.skill(`Duplicate skill name ignored: ${name}`, {
            existing: this.skills.get(name)?.path,
            duplicate: skill.path,
          });
          continue;
        }
        this.skills.set(name, skill);
      }
    }

    this.logger?.skill(`Loaded ${this.skills.size} skills total`);
  }

  /**
   * List all loaded skills with their summaries.
   *
   * @returns Array of skill summaries (name + description)
   */
  list(): SkillSummary[] {
    return Array.from(this.skills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * Get a specific skill by name.
   *
   * @param name - Skill name to look up
   * @returns Skill object or undefined if not found
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get formatted descriptions for all skills.
   *
   * Returns a string suitable for displaying available skills.
   *
   * @returns Formatted skill list
   */
  getDescriptions(): string {
    if (this.skills.size === 0) {
      return "(no skills available)";
    }

    const lines: string[] = [];
    for (const [name, skill] of this.skills) {
      lines.push(`  - ${name}: ${skill.description}`);
    }
    return lines.join("\n");
  }

  /**
   * Get the number of loaded skills.
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Check if a skill exists.
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get all skill names.
   */
  names(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Clear all loaded skills.
   */
  clear(): void {
    this.skills.clear();
  }
}
