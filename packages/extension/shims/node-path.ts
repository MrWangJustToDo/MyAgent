/**
 * Minimal `node:path` stand-in for browser / extension bundles.
 * Avoids Vite's externalized `node:path` stub when deps import it.
 */

export type ParsedPath = {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
};

function normalize(p: string): string {
  return p.replace(/\\/g, "/");
}

export function basename(p: string, ext?: string): string {
  const base = normalize(p).split("/").pop() || p;
  if (ext && base.endsWith(ext) && base.length > ext.length) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function dirname(p: string): string {
  const normalized = normalize(p);
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized.startsWith("/") ? "/" : ".";
  return normalized.slice(0, idx) || "/";
}

export function extname(p: string): string {
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

export function parse(p: string): ParsedPath {
  const normalized = normalize(p);
  const base = basename(normalized);
  const dir = dirname(normalized);
  const ext = extname(base);
  const name = ext ? base.slice(0, -ext.length) : base;
  const root = normalized.startsWith("/") ? "/" : "";
  return { root, dir, base, ext, name };
}

export function join(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export const sep = "/";
export const delimiter = ":";

export default {
  basename,
  dirname,
  extname,
  parse,
  join,
  resolve,
  sep,
  delimiter,
};
