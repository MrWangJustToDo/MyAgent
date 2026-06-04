/**
 * Native Node.js filesystem scoped to a workspace root.
 */

import * as fs from "fs/promises";
import * as path from "path";

import type { SandboxFileSystem } from "./types.js";

export interface NativeFilesystemHandle {
  readonly rootPath: string;
  readonly filesystem: SandboxFileSystem;
  resolvePath(inputPath: string): string;
}

/**
 * Create a filesystem implementation rooted at `rootPath`.
 */
export function createNativeFilesystem(rootPath: string): NativeFilesystemHandle {
  const resolvePath = (inputPath: string): string => {
    if (inputPath.startsWith(rootPath)) {
      return inputPath;
    }
    const normalized = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
    return path.join(rootPath, normalized);
  };

  const filesystem: SandboxFileSystem = {
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

    copy: async (sourcePath: string, targetPath: string) => {
      const fullSourcePath = resolvePath(sourcePath);
      const fullTargetPath = resolvePath(targetPath);
      await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
      await fs.copyFile(fullSourcePath, fullTargetPath, fs.constants.COPYFILE_EXCL);
    },
  };

  return { rootPath, filesystem, resolvePath };
}
