/**
 * Skill Types - Type definitions for the skill loading system.
 *
 * Skills are domain-specific instructions loaded on-demand via tools.
 * Each skill is defined in a SKILL.md file with YAML frontmatter.
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for skill metadata in YAML frontmatter.
 */
export const skillMetadataSchema = z.object({
  /** Skill identifier (required) */
  name: z.string(),
  /** Brief description for discovery (required) */
  description: z.string(),
  /** License information */
  license: z.string().optional(),
  /** Compatibility requirements */
  compatibility: z.string().optional(),
  /** Additional metadata */
  metadata: z
    .object({
      author: z.string().optional(),
      version: z.string().optional(),
      generatedBy: z.string().optional(),
    })
    .optional(),
});

/**
 * Schema for a complete skill (metadata + body).
 */
export const skillSchema = z.object({
  /** Skill identifier */
  name: z.string(),
  /** Brief description for discovery */
  description: z.string(),
  /** Full skill content (markdown body) */
  body: z.string(),
  /** Path to the SKILL.md file */
  path: z.string(),
  /** Full metadata from frontmatter */
  metadata: skillMetadataSchema,
});

// ============================================================================
// Types
// ============================================================================

/**
 * Skill metadata extracted from YAML frontmatter.
 */
export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

/**
 * A complete skill with metadata and body content.
 */
export type Skill = z.infer<typeof skillSchema>;

/**
 * Skill summary for listing (name + description only).
 */
export interface SkillSummary {
  /** Skill identifier */
  name: string;
  /** Brief description */
  description: string;
}
