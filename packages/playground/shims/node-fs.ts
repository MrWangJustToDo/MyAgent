/** No-op Node `fs` / `fs/promises` stand-ins for browser bundles. */

async function notSupported(name: string): Promise<never> {
  throw new Error(`node:fs.${name} is not available in the browser playground`);
}

export const promises = {
  readFile: (..._args: unknown[]) => notSupported("readFile"),
  writeFile: (..._args: unknown[]) => notSupported("writeFile"),
  readdir: (..._args: unknown[]) => notSupported("readdir"),
  mkdir: (..._args: unknown[]) => notSupported("mkdir"),
  rm: (..._args: unknown[]) => notSupported("rm"),
  unlink: (..._args: unknown[]) => notSupported("unlink"),
  access: (..._args: unknown[]) => notSupported("access"),
  stat: (..._args: unknown[]) => notSupported("stat"),
  lstat: (..._args: unknown[]) => notSupported("lstat"),
  realpath: (..._args: unknown[]) => notSupported("realpath"),
  readlink: (..._args: unknown[]) => notSupported("readlink"),
  appendFile: (..._args: unknown[]) => notSupported("appendFile"),
  open: (..._args: unknown[]) => notSupported("open"),
  rename: (..._args: unknown[]) => notSupported("rename"),
};

export const readFile = promises.readFile;
export const writeFile = promises.writeFile;
export const readdir = promises.readdir;
export const mkdir = promises.mkdir;
export const rm = promises.rm;
export const unlink = promises.unlink;
export const access = promises.access;
export const stat = promises.stat;
export const lstat = promises.lstat;
export const realpath = promises.realpath;
export const readlink = promises.readlink;
export const appendFile = promises.appendFile;
export const open = promises.open;
export const rename = promises.rename;

export default { promises, ...promises };
