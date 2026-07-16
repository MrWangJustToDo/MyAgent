const MIME_BY_EXT: Record<string, string> = {
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

export function mimeFromPath(filePath: string): string | false {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return MIME_BY_EXT[lower.slice(dot)] ?? false;
}
