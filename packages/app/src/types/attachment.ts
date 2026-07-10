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
