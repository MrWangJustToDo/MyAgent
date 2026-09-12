import { IMAGE_REF_RE } from "./user-input-helpers.js";

/**
 * Inline segments of a submitted user message.
 *
 * A user message is plain text, but it can embed machine-generated references:
 * - `[Image #N: filename]` refs (produced from input attachments)
 * - `<skill name="…">…</skill>` blocks injected by `/skill <name>`
 * - `<memory name="…" type="…">…</memory>` blocks injected by `/memory <name>`
 *
 * The transcript renders the blocks as compact chips: the payload is already
 * persisted (and sent to the model) verbatim, so repeating hundreds of lines in
 * the transcript only costs screen space. See {@link UserMessageView}.
 */
export type UserMessageSegment =
  | { type: "text"; content: string }
  | { type: "image"; displayIndex: number; filename: string }
  | { type: "skill"; name: string; lineCount: number }
  | { type: "memory"; name: string; memoryType?: string; lineCount: number };

/**
 * Injected `/skill <name>` payload — it always LEADS the message (the injection
 * template puts the block first, with the optional follow-up after it). Anchored
 * on purpose: the same tags quoted inside a sentence are content the reader
 * wrote and must stay visible.
 */
const LEADING_SKILL_BLOCK_RE = /^\s*<skill\s+name="([^"]*)"\s*>([\s\S]*?)<\/skill>/;

/** Injected `/memory <name>` payload — leading, same anchoring rationale. */
const LEADING_MEMORY_BLOCK_RE = /^\s*<memory\s+name="([^"]*)"(?:\s+type="([^"]*)")?\s*>([\s\S]*?)<\/memory>/;

/** Body line count, ignoring the padding newlines the injection templates add. */
function blockLineCount(body: string): number {
  const trimmed = body.replace(/^\n+|\n+$/g, "");
  return trimmed ? trimmed.split("\n").length : 0;
}

interface LeadingBlock {
  segment: UserMessageSegment;
  /** Offset just past the closing tag. */
  end: number;
}

/** Match a leading injected block; a nameless block is not an injection. */
function matchLeadingBlock(text: string): LeadingBlock | undefined {
  const skill = LEADING_SKILL_BLOCK_RE.exec(text);
  if (skill) {
    const name = skill[1]!.trim();
    if (name) return { segment: { type: "skill", name, lineCount: blockLineCount(skill[2]!) }, end: skill[0].length };
  }

  const memory = LEADING_MEMORY_BLOCK_RE.exec(text);
  if (memory) {
    const name = memory[1]!.trim();
    if (name) {
      // Omit `memoryType` when absent so `deepEqual`-based tests see a minimal segment.
      const segment: Extract<UserMessageSegment, { type: "memory" }> = {
        type: "memory",
        name,
        lineCount: blockLineCount(memory[3]!),
      };
      if (memory[2]) segment.memoryType = memory[2];
      return { segment, end: memory[0].length };
    }
  }

  return undefined;
}

/**
 * Split submitted user text into plain text and machine-generated refs
 * (`[Image #N: filename]` plus a leading `<skill>` / `<memory>` block) for
 * inline UI rendering.
 */
export function parseUserMessageSegments(text: string): UserMessageSegment[] {
  const segments: UserMessageSegment[] = [];

  const leading = matchLeadingBlock(text);
  const body = leading ? text.slice(leading.end) : text;
  if (leading) segments.push(leading.segment);

  // Image refs may sit anywhere in the (remaining) text.
  const re = new RegExp(IMAGE_REF_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: body.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "image",
      displayIndex: Number.parseInt(match[1]!, 10),
      filename: match[2]!.trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", content: body.slice(lastIndex) });
  }

  return segments;
}

/** Compact chip label matching MultiLineInput (`[Image #N]`). */
export function formatImageChipLabel(displayIndex: number): string {
  return `[Image #${displayIndex}]`;
}

/** Compact chip label for a collapsed `<skill>` block. */
export function formatSkillChipLabel(name: string): string {
  return `[Skill: ${name}]`;
}

/** Compact chip label for a collapsed `<memory>` block. */
export function formatMemoryChipLabel(name: string, memoryType?: string): string {
  return memoryType ? `[Memory: ${name} (${memoryType})]` : `[Memory: ${name}]`;
}
