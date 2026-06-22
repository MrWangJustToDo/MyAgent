/**
 * SkillLoader - Parses SKILL.md files with YAML frontmatter.
 *
 * Scans directories for SKILL.md files, extracts YAML frontmatter metadata,
 * and provides the skill body content.
 *
 * @example
 * ```typescript
 * const loader = new SkillLoader({ rootPath: "/project" });
 * const skills = await loader.loadFromDirectory("/path/to/skills");
 *
 * // skills is a Map<string, Skill> keyed by skill name
 * const gitSkill = skills.get("git-workflow");
 * ```
 */

import { parse as parseYaml } from "yaml";

import { getEnv } from "../../env.js";

import { skillMetadataSchema } from "./types.js";

import type { Skill, SkillMetadata } from "./types.js";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// Types
// ============================================================================

export interface SkillLoaderConfig {
  /** Root path for resolving relative paths */
  rootPath: string;
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
  private rootPath: string;
  private logger?: AgentLog;

  constructor(config: SkillLoaderConfig) {
    this.rootPath = config.rootPath;
    this.logger = config.logger;
  }

  /**
   * Check if directory exists.
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    const env = getEnv();
    try {
      const stat = await env.fs.stat(dirPath);
      return stat.isDirectory;
    } catch {
      return false;
    }
  }

  /**
   * Read file content.
   */
  private async readFileContent(filePath: string): Promise<string> {
    return getEnv().fs.readFile(filePath);
  }

  /**
   * Find SKILL.md files in a directory.
   */
  private async findSkillFiles(dirPath: string): Promise<string[]> {
    const env = getEnv();

    if (env.path.isAbsolute(dirPath)) {
      return this.findSkillFilesRecursive(dirPath);
    }

    const resolvedPath = env.path.join(this.rootPath, dirPath);
    const findResult = await env.runCommand(`find "${resolvedPath}" -name "SKILL.md" -type f 2>/dev/null`);

    return findResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Recursively find SKILL.md files using env.fs.
   */
  private async findSkillFilesRecursive(dirPath: string): Promise<string[]> {
    const env = getEnv();
    const files: string[] = [];

    try {
      const entries = await env.fs.readdir(dirPath);

      for (const entry of entries) {
        const fullPath = env.path.join(dirPath, entry.name);

        if (entry.type === "directory") {
          const subFiles = await this.findSkillFilesRecursive(fullPath);
          files.push(...subFiles);
        } else if (entry.type === "file" && entry.name === "SKILL.md") {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
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
    if (!text.startsWith("---")) {
      return {
        metadata: null,
        body: text.trim(),
      };
    }

    const endIndex = text.indexOf("\n---", 3);
    if (endIndex === -1) {
      return {
        metadata: null,
        body: text.trim(),
      };
    }

    const yamlContent = text.slice(4, endIndex).trim();
    const body = text.slice(endIndex + 4).trim();

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
   * @param dirPath - Directory path to scan (absolute or relative to rootPath)
   * @returns Map of skill name to Skill object
   */
  async loadFromDirectory(dirPath: string): Promise<Map<string, Skill>> {
    const skills = new Map<string, Skill>();

    const dirExists = await this.directoryExists(dirPath);
    if (!dirExists) {
      this.logger?.skill(`Skill directory does not exist: ${dirPath}`);
      return skills;
    }

    const files = await this.findSkillFiles(dirPath);

    for (const filePath of files) {
      try {
        const content = await this.readFileContent(filePath);
        const { metadata, body, error } = this.parseFrontmatter(content);

        if (error) {
          this.logger?.skill(`Skipping skill file with error: ${filePath}`, { error });
          continue;
        }

        const pathParts = filePath.split("/");
        const skillDir = pathParts[pathParts.length - 2] || "unknown";

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
