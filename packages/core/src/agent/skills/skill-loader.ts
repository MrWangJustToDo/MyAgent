/**
 * SkillLoader - Parses SKILL.md files with YAML frontmatter.
 *
 * Scans directories for SKILL.md files, extracts YAML frontmatter metadata,
 * and provides the skill body content.
 *
 * Supports both:
 * - Absolute paths (e.g., ~/.agents/skills) - uses Node.js fs directly
 * - Relative paths (e.g., .agents/skills) - uses sandbox filesystem
 *
 * @example
 * ```typescript
 * const loader = new SkillLoader({ sandbox, rootPath: "/project" });
 * const skills = await loader.loadFromDirectory("/path/to/skills");
 *
 * // skills is a Map<string, Skill> keyed by skill name
 * const gitSkill = skills.get("git-workflow");
 * ```
 */

import * as fs from "fs/promises";
import * as nodePath from "path";
import { parse as parseYaml } from "yaml";

import { skillMetadataSchema } from "./types.js";

import type { Skill, SkillMetadata } from "./types.js";
import type { Sandbox } from "../../environment";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// Types
// ============================================================================

export interface SkillLoaderConfig {
  /** Sandbox for file system operations (used for relative paths) */
  sandbox: Sandbox;
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
  private sandbox: Sandbox;
  private rootPath: string;
  private logger?: AgentLog;

  constructor(config: SkillLoaderConfig) {
    this.sandbox = config.sandbox;
    this.rootPath = config.rootPath;
    this.logger = config.logger;
  }

  /**
   * Check if a path is absolute.
   */
  private isAbsolutePath(dirPath: string): boolean {
    return nodePath.isAbsolute(dirPath);
  }

  /**
   * Check if directory exists using appropriate method based on path type.
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    if (this.isAbsolutePath(dirPath)) {
      try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
      } catch {
        return false;
      }
    }
    return this.sandbox.filesystem.exists(dirPath);
  }

  /**
   * Read file content using appropriate method based on path type.
   */
  private async readFileContent(filePath: string): Promise<string> {
    if (this.isAbsolutePath(filePath)) {
      return fs.readFile(filePath, "utf-8");
    }
    return this.sandbox.filesystem.readFile(filePath);
  }

  /**
   * Find SKILL.md files in a directory.
   */
  private async findSkillFiles(dirPath: string): Promise<string[]> {
    if (this.isAbsolutePath(dirPath)) {
      return this.findSkillFilesRecursive(dirPath);
    }

    // For relative paths, resolve to absolute and use sandbox runCommand
    const resolvedPath = nodePath.join(this.rootPath, dirPath);
    const findResult = await this.sandbox.runCommand(`find "${resolvedPath}" -name "SKILL.md" -type f 2>/dev/null`);

    return findResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Recursively find SKILL.md files using Node.js fs.
   */
  private async findSkillFilesRecursive(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = nodePath.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findSkillFilesRecursive(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name === "SKILL.md") {
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
   * Supports both absolute paths (e.g., /home/user/.agents/skills) and
   * relative paths (e.g., .agents/skills).
   *
   * @param dirPath - Directory path to scan (absolute or relative to rootPath)
   * @returns Map of skill name to Skill object
   */
  async loadFromDirectory(dirPath: string): Promise<Map<string, Skill>> {
    const skills = new Map<string, Skill>();

    // Check if directory exists
    const dirExists = await this.directoryExists(dirPath);
    if (!dirExists) {
      this.logger?.skill(`Skill directory does not exist: ${dirPath}`);
      return skills;
    }

    // Find all SKILL.md files
    const files = await this.findSkillFiles(dirPath);

    for (const filePath of files) {
      try {
        const content = await this.readFileContent(filePath);
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
