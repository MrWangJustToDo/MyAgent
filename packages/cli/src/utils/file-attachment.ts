import fs from "node:fs";
import path from "node:path";

import type { Attachment } from "../types/attachment.js";

// ============================================================================
// MIME type mapping
// ============================================================================

const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".py",
  ".rs",
  ".go",
  ".sh",
  ".log",
  ".csv",
  ".env",
  ".sql",
  ".c",
  ".cpp",
  ".h",
  ".java",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".conf",
  ".cfg",
  ".ini",
  ".dockerfile",
  ".makefile",
  ".gitignore",
]);

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const TEXT_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

// ============================================================================
// Helpers
// ============================================================================

export function isImageFile(ext: string): boolean {
  return ext.toLowerCase() in IMAGE_EXTENSIONS;
}

export function isTextFile(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function getImageMimeType(ext: string): string | undefined {
  return IMAGE_EXTENSIONS[ext.toLowerCase()];
}

function isLikelyBinary(buffer: Buffer): boolean {
  // Check first 8KB for null bytes — a strong indicator of binary content
  const checkLen = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================================================
// Main resolver
// ============================================================================

export type ResolveResult = { ok: true; attachment: Attachment } | { ok: false; error: string };

export function resolveAttachment(filePath: string): ResolveResult {
  // Expand ~ to home directory
  const resolved = filePath.startsWith("~/")
    ? path.join(process.env.HOME || "", filePath.slice(2))
    : path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { ok: false, error: `Not a file: ${filePath}` };
  }

  const ext = path.extname(resolved).toLowerCase();
  const filename = path.basename(resolved);

  // Image file
  if (isImageFile(ext)) {
    if (stat.size > IMAGE_SIZE_LIMIT) {
      return { ok: false, error: `Image too large: ${formatSize(stat.size)} (max ${formatSize(IMAGE_SIZE_LIMIT)})` };
    }

    const buffer = fs.readFileSync(resolved);
    const mimeType = getImageMimeType(ext)!;
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return {
      ok: true,
      attachment: { path: resolved, filename, mediaType: mimeType, type: "image", size: stat.size, dataUrl },
    };
  }

  // Known text file
  if (isTextFile(ext)) {
    if (stat.size > TEXT_SIZE_LIMIT) {
      return { ok: false, error: `Text file too large: ${formatSize(stat.size)} (max ${formatSize(TEXT_SIZE_LIMIT)})` };
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const dataUrl = `data:text/plain;base64,${Buffer.from(content).toString("base64")}`;

    return {
      ok: true,
      attachment: { path: resolved, filename, mediaType: "text/plain", type: "text", size: stat.size, dataUrl },
    };
  }

  // Unknown extension — try reading as text
  if (stat.size > TEXT_SIZE_LIMIT) {
    return { ok: false, error: `File too large: ${formatSize(stat.size)} (max ${formatSize(TEXT_SIZE_LIMIT)})` };
  }

  const buffer = fs.readFileSync(resolved);
  if (isLikelyBinary(buffer)) {
    return { ok: false, error: `Unsupported binary file type: ${ext || "(no extension)"}` };
  }

  const content = buffer.toString("utf-8");
  const dataUrl = `data:text/plain;base64,${Buffer.from(content).toString("base64")}`;

  return {
    ok: true,
    attachment: { path: resolved, filename, mediaType: "text/plain", type: "text", size: stat.size, dataUrl },
  };
}

/** Check if a string looks like a file path */
export function looksLikeFilePath(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("~/");
}

export { formatSize };
