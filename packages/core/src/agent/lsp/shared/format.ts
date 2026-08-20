/** Format LSP locations / location links into `file:line:col` strings. */

import type { Location, LocationLink } from "vscode-languageserver-protocol";

function uriToPath(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol === "file:") {
      return decodeURIComponent(url.pathname);
    }
    return uri;
  } catch {
    return uri;
  }
}

/** Convert a file URI to a filesystem path (relative to rootDir when possible). */
export function fileUriToPath(uri: string, rootDir: string): string {
  const abs = uriToPath(uri);
  try {
    if (abs.startsWith(rootDir)) {
      return abs.slice(rootDir.length).replace(/^[\\/]/, "") || ".";
    }
  } catch {
    // fall through
  }
  return abs;
}

/** Format a Location (file:line:col). */
export function formatLocation(loc: Location, rootDir: string): string {
  const path = fileUriToPath(loc.uri, rootDir);
  const line = loc.range.start.line + 1;
  const col = loc.range.start.character + 1;
  return `${path}:${line}:${col}`;
}

/** Format a LocationLink (file:line:col — target range). */
export function formatLocationLink(link: LocationLink, rootDir: string): string {
  const path = fileUriToPath(link.targetUri, rootDir);
  const line = link.targetRange.start.line + 1;
  const col = link.targetRange.start.character + 1;
  return `${path}:${line}:${col}`;
}

/** Convert a file path to a `file://` URI. */
export function pathToFileUri(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}
