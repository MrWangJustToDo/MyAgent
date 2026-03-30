import { getImageBase64, hasImage } from "@crosscopy/clipboard";

import type { Attachment } from "../types/attachment.js";

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

/**
 * Try to read an image from the system clipboard.
 * Uses @crosscopy/clipboard for cross-platform native clipboard access.
 */
export async function readImageFromClipboard(): Promise<Attachment | null> {
  try {
    if (!hasImage()) return null;

    const rawBase64 = await getImageBase64();
    if (!rawBase64) return null;

    // Strip whitespace/newlines and fix padding — some clipboard backends return dirty base64
    const stripped = rawBase64.replace(/[\s\r\n]+/g, "");
    if (!stripped) return null;
    // Ensure proper base64 padding (Go/Ollama requires it, unlike Node.js which is lenient)
    const padLen = (4 - (stripped.length % 4)) % 4;
    const base64 = padLen > 0 ? stripped + "=".repeat(padLen) : stripped;

    const size = Math.ceil((base64.length * 3) / 4); // approximate decoded size
    if (size > IMAGE_SIZE_LIMIT) return null;

    const dataUrl = `data:image/png;base64,${base64}`;
    const filename = `clipboard-${Date.now()}.png`;

    return {
      path: "clipboard",
      filename,
      mediaType: "image/png",
      type: "image",
      size,
      dataUrl,
    };
  } catch {
    return null;
  }
}
