/**
 * Native Node.js filesystem scoped to a workspace root.
 */

import { FileError } from "@my-agent/core";
import * as fs from "fs/promises";
import * as path from "path";

import type { CoreEnvFs } from "@my-agent/core";

export interface NativeFilesystemHandle {
  readonly rootPath: string;
  readonly filesystem: CoreEnvFs;
  resolvePath(inputPath: string): string;
}

/**
 * Create a filesystem implementation rooted at `rootPath`.
 */
export function createNativeFilesystem(rootPath: string): NativeFilesystemHandle {
  const resolvedRoot = path.resolve(rootPath);

  const resolvePath = (inputPath: string): string => {
    const resolved = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(resolvedRoot, inputPath);
    if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
      throw new FileError(
        "permission_denied",
        `Path traversal blocked: "${inputPath}" resolves outside workspace root`,
        inputPath
      );
    }
    return resolved;
  };

  const filesystem: CoreEnvFs = {
    readFile: async (filePath: string) => {
      const fullPath = resolvePath(filePath);
      return fs.readFile(fullPath, "utf-8");
    },

    readFileBuffer: async (filePath: string) => {
      const fullPath = resolvePath(filePath);
      return fs.readFile(fullPath);
    },

    stat: async (filePath: string) => {
      const fullPath = resolvePath(filePath);
      const stats = await fs.stat(fullPath);
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        mtime: stats.mtime,
      };
    },

    writeFile: async (filePath: string, content: string) => {
      const fullPath = resolvePath(filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
    },

    readdir: async (dirPath: string) => {
      const fullPath = resolvePath(dirPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const result: Array<{ name: string; type: "file" | "directory"; size?: number; modified?: Date }> = [];

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        let size: number | undefined;
        let modified: Date | undefined;

        try {
          const stats = await fs.stat(entryPath);
          size = stats.size;
          modified = stats.mtime;
        } catch {
          // Ignore stat errors for individual entries
        }

        result.push({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size,
          modified,
        });
      }

      return result;
    },

    mkdir: async (dirPath: string) => {
      const fullPath = resolvePath(dirPath);
      await fs.mkdir(fullPath, { recursive: true });
    },

    exists: async (filePath: string) => {
      const fullPath = resolvePath(filePath);
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    },

    remove: async (filePath: string) => {
      const fullPath = resolvePath(filePath);
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    },

    appendFile: async (filePath: string, content: string) => {
      const fullPath = resolvePath(filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.appendFile(fullPath, content, "utf-8");
    },
  };

  return { rootPath, filesystem, resolvePath };
}
