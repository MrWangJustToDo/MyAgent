/**
 * SkillRegistry - Manages loaded skills and provides lookup methods.
 *
 * Central registry for skills loaded from multiple directories.
 * Provides methods for listing available skills and loading specific ones.
 *
 * @example
 * ```typescript
 * const registry = new SkillRegistry({ sandbox, logger });
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
import type { Sandbox } from "../../environment";

// ============================================================================
// Types
// ============================================================================

export interface SkillRegistryConfig {
  /** Sandbox for file system operations */
  sandbox: Sandbox;
  /** Optional logger for warnings and debug info */
  logger?: {
    warn: (message: string, data?: unknown) => void;
    debug: (message: string, data?: unknown) => void;
  };
}

// ============================================================================
// SkillRegistry Class
// ============================================================================

/**
 * Central registry for managing loaded skills.
 */
export class SkillRegistry {
  private sandbox: Sandbox;
  private logger?: SkillRegistryConfig["logger"];
  private skills: Map<string, Skill> = new Map();
  private loader: SkillLoader;

  constructor(config: SkillRegistryConfig) {
    this.sandbox = config.sandbox;
    this.logger = config.logger;
    this.loader = new SkillLoader({ sandbox: config.sandbox, logger: config.logger });
  }

  /**
   * Load skills from multiple directories.
   *
   * Paths are relative to the sandbox root (which is already set to rootPath).
   * The sandbox treats rootPath as `/`, so we use paths directly.
   * First loaded skill wins in case of name conflicts.
   *
   * @param dirs - Array of directory paths (relative to sandbox root)
   */
  async loadFromDirectories(dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      // Use path directly - sandbox root is already the project root
      // Normalize: remove leading ./ if present
      const normalizedPath = dir.startsWith("./") ? dir.slice(2) : dir;

      this.logger?.debug(`Loading skills from: ${normalizedPath}`);

      const dirSkills = await this.loader.loadFromDirectory(normalizedPath);

      // Add skills to registry, first loaded wins
      for (const [name, skill] of dirSkills) {
        if (this.skills.has(name)) {
          this.logger?.warn(`Duplicate skill name ignored: ${name}`, {
            existing: this.skills.get(name)?.path,
            duplicate: skill.path,
          });
          continue;
        }
        this.skills.set(name, skill);
      }
    }

    this.logger?.debug(`Loaded ${this.skills.size} skills total`);
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
