/**
 * SkillLoader - Parses SKILL.md files with YAML frontmatter.
 *
 * Scans directories for SKILL.md files, extracts YAML frontmatter metadata,
 * and provides the skill body content.
 *
 * @example
 * ```typescript
 * const loader = new SkillLoader();
 * const skills = await loader.loadFromDirectory("/path/to/skills");
 *
 * // skills is a Map<string, Skill> keyed by skill name
 * const gitSkill = skills.get("git-workflow");
 * ```
 */

import { parse as parseYaml } from "yaml";

import { skillMetadataSchema } from "./types.js";

import type { Skill, SkillMetadata } from "./types.js";
import type { Sandbox } from "../../environment";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// Types
// ============================================================================

export interface SkillLoaderConfig {
  /** Sandbox for file system operations */
  sandbox: Sandbox;
  /** Optional logger for warnings */
  logger?: AgentLog;
}

export interface ParsedFrontmatter {
  /** Parsed metadata */
  metadata: SkillMetadata | null;
  /** Content body after frontmatter */
  body: string;
  /** Parse error if any */
  error?: string;
}

// ============================================================================
// SkillLoader Class
// ============================================================================

/**
 * Loads and parses SKILL.md files from directories.
 */
export class SkillLoader {
  private sandbox: Sandbox;
  private logger?: AgentLog;

  constructor(config: SkillLoaderConfig) {
    this.sandbox = config.sandbox;
    this.logger = config.logger;
  }

  /**
   * Parse YAML frontmatter from text content.
   *
   * Frontmatter is delimited by `---` lines at the start of the file.
   *
   * @param text - Raw file content
   * @returns Parsed frontmatter and body
   */
  parseFrontmatter(text: string): ParsedFrontmatter {
    // Check for frontmatter delimiters
    if (!text.startsWith("---")) {
      // No frontmatter - treat entire content as body
      return {
        metadata: null,
        body: text.trim(),
      };
    }

    // Find the closing delimiter
    const endIndex = text.indexOf("\n---", 3);
    if (endIndex === -1) {
      // No closing delimiter - treat as body only
      return {
        metadata: null,
        body: text.trim(),
      };
    }

    // Extract frontmatter YAML
    const yamlContent = text.slice(4, endIndex).trim();
    const body = text.slice(endIndex + 4).trim();

    // Parse YAML using the yaml package
    try {
      const metadata = parseYaml(yamlContent);
      const validated = skillMetadataSchema.safeParse(metadata);

      if (!validated.success) {
        return {
          metadata: null,
          body: text.trim(),
          error: `Invalid frontmatter: ${validated.error.message}`,
        };
      }

      return {
        metadata: validated.data,
        body,
      };
    } catch (error) {
      return {
        metadata: null,
        body: text.trim(),
        error: `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Load skills from a directory.
   *
   * Scans recursively for SKILL.md files. Each skill is identified by its
   * parent directory name.
   *
   * @param dirPath - Directory path to scan
   * @returns Map of skill name to Skill object
   */
  async loadFromDirectory(dirPath: string): Promise<Map<string, Skill>> {
    const skills = new Map<string, Skill>();

    // Check if directory exists
    const dirExists = await this.sandbox.filesystem.exists(dirPath);
    if (!dirExists) {
      this.logger?.skill(`Skill directory does not exist: ${dirPath}`);
      return skills;
    }

    // Find all SKILL.md files
    const findResult = await this.sandbox.runCommand(`find "${dirPath}" -name "SKILL.md" -type f 2>/dev/null`);

    const files = findResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const filePath of files) {
      try {
        const content = await this.sandbox.filesystem.readFile(filePath);
        const { metadata, body, error } = this.parseFrontmatter(content);

        if (error) {
          this.logger?.skill(`Skipping skill file with error: ${filePath}`, { error });
          continue;
        }

        // Derive skill ID from parent directory name
        const pathParts = filePath.split("/");
        const skillDir = pathParts[pathParts.length - 2] || "unknown";

        // Use name from frontmatter or directory name
        const name = metadata?.name || skillDir;
        const description = metadata?.description || "";

        const skill: Skill = {
          name,
          description,
          body,
          path: filePath,
          metadata: metadata || {
            name,
            description,
          },
        };

        skills.set(name, skill);
      } catch (error) {
        this.logger?.skill(`Failed to load skill file: ${filePath}`, { error });
      }
    }

    this.logger?.skill(`Loaded skills from ${dirPath} success`, { skills });

    return skills;
  }
}
