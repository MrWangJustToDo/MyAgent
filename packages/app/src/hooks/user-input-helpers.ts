import type { Attachment } from "../types/attachment.js";

/**
 * Unicode Private Use Area characters for image placeholders.
 * Each image gets a unique character so images behave like single input characters.
 */
export const IMAGE_PLACEHOLDER_START = 0xe000;
export const IMAGE_PLACEHOLDER_END = 0xe0ff;

/** Stable ref embedded in submitted text for LLM + UI composition. Example: `[Image #1: clipboard-a1b2c3d4.png]` */
export const IMAGE_REF_RE = /\[Image #(\d+): ([^\]]+)\]/g;

/** Check if a character is an image placeholder. */
export function isImagePlaceholder(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
}

/** Get the image index from a placeholder character. */
export function getImageIndex(char: string): number {
  return char.charCodeAt(0) - IMAGE_PLACEHOLDER_START;
}

/** Create a placeholder character for an image index. */
export function createImagePlaceholder(index: number): string {
  return String.fromCharCode(IMAGE_PLACEHOLDER_START + index);
}

/** Format a stable image ref for submitted text / history. */
export function formatImageRef(displayIndex: number, filename: string): string {
  return `[Image #${displayIndex}: ${filename}]`;
}

export function removeAttachmentAtIndex(attachments: Attachment[], imageIndex: number): Attachment[] {
  return attachments
    .map((attachment, index) => (index === imageIndex ? null : attachment))
    .filter(Boolean) as Attachment[];
}

/**
 * Convert input value + sparse attachments into submitted text (with image refs) and
 * attachments ordered by placeholder appearance.
 */
export function extractSubmittedInput(
  rawValue: string,
  attachments: Attachment[]
): { text: string; attachments: Attachment[] } {
  let text = "";
  const orderedAttachments: Attachment[] = [];
  let displayNum = 1;

  for (const char of rawValue) {
    if (isImagePlaceholder(char)) {
      const attachment = attachments[getImageIndex(char)];
      if (attachment) {
        text += formatImageRef(displayNum, attachment.filename);
        orderedAttachments.push(attachment);
        displayNum++;
      }
    } else {
      text += char;
    }
  }

  return { text: text.trim(), attachments: orderedAttachments };
}

export function appendHistoryEntry(history: string[], text: string): string[] {
  if (!text || history[history.length - 1] === text) {
    return history;
  }
  return [...history, text];
}

export function hasImagePlaceholder(value: string): boolean {
  for (const char of value) {
    if (isImagePlaceholder(char)) {
      return true;
    }
  }
  return false;
}
