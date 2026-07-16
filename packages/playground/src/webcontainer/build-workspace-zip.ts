import { zipSync } from "fflate";

import type { FileSystemAPI } from "@webcontainer/api";

function zipEntryName(absolutePath: string): string {
  return absolutePath.replace(/^\//, "");
}

/**
 * Read selected files from WebContainer fs and build a zip (paths relative to workspace root).
 */
export async function buildWorkspaceZip(fs: FileSystemAPI, filePaths: string[]): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  for (const absolutePath of filePaths) {
    const data = await fs.readFile(absolutePath);
    files[zipEntryName(absolutePath)] = data;
  }

  return zipSync(files, { level: 6 });
}

export function downloadUint8Array(filename: string, data: Uint8Array, mime = "application/zip"): void {
  const blob = new Blob([data.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
