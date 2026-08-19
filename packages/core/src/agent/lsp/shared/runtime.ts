/**
 * Runtime access — the minimal set of host operations LSP tools need.
 *
 * Injected at extension activation from the CoreEnv, so the core stays
 * runtime-agnostic (browser/WebContainer hosts can supply their own).
 */

/** Abstract path operations (from CoreEnv.path). */
export interface RuntimePath {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
  extname(p: string): string;
  relative(from: string, to: string): string;
}

/** Abstract file read/write (from CoreEnv.fs). */
export interface RuntimeFs {
  readFile(path: string, encoding: "utf-8"): Promise<string>;
  exists(path: string): Promise<boolean>;
}

/** Runtime-access bundle handed to tool factories. */
export interface RuntimeAccess {
  path: RuntimePath;
  fs: RuntimeFs;
  /** Read a file's contents as UTF-8 (throws on failure). */
  readFile(absPath: string): Promise<string>;
  /** Check whether a path exists. */
  exists(path: string): Promise<boolean>;
  /** Convert a file URI to a filesystem path. */
  fileUriToPath(uri: string): string;
}
