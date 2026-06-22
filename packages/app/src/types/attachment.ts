import type { FileUIPart } from "ai";

export interface Attachment {
  /** Original file path */
  path: string;
  /** File name (basename) */
  filename: string;
  /** MIME type */
  mediaType: string;
  /** Whether this is an image or text file */
  type: "image" | "text";
  /** File size in bytes */
  size: number;
  /** Data URL with file content (base64-encoded) */
  dataUrl: string;
}

/** Convert an Attachment to the AI SDK's FileUIPart format */
export function attachmentToFileUIPart(attachment: Attachment): FileUIPart {
  return {
    type: "file",
    mediaType: attachment.mediaType,
    filename: attachment.filename,
    url: attachment.dataUrl,
  };
}
