import { clipboardImageFilename } from "./attachment-hash.js";

import type { ClipboardImageResult } from "../adapter/types.js";
import type { Attachment } from "../types/attachment.js";

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

export function clipboardResultToAttachment(result: ClipboardImageResult): Attachment | null {
  const size = Math.ceil((result.data.length * 3) / 4);
  if (size > IMAGE_SIZE_LIMIT) return null;

  const dataUrl = `data:${result.mediaType};base64,${result.data}`;
  const filename = clipboardImageFilename(result.data);

  return {
    path: "clipboard",
    filename,
    mediaType: result.mediaType,
    type: "image",
    size,
    dataUrl,
  };
}
