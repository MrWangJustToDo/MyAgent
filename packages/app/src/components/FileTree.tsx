import { useCallback, useEffect, useMemo, useState } from "@my-react/react";
import { Box, Text } from "ink";

import { BG, COLORS } from "../theme/colors.js";
import { formatFolderGlyph, formatIconGlyph, getFileIconStyle, getFolderIconStyle } from "../utils/file-icons.js";
import { joinWorkspacePath, workspaceRelativePath } from "../utils/workspace-path.js";

import type { FileEntry } from "@my-agent/core";

// ============================================================================
// Dir Cache
// ============================================================================

const dirCache = new Map<string, FileEntry[]>();

export function clearDirCache(): void {
  dirCache.clear();
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ============================================================================
// Git Status
// ============================================================================

export function parseGitStatus(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split("\n")) {
    if (line.length < 3) continue;
    const status = line.slice(0, 2).trim();
    const filepath = line.slice(3).trim();
    if (filepath) map.set(filepath, status);
  }
  return map;
}

let gitStatusCache: { rootPath: string; status: Map<string, string> } | null = null;

export function clearGitStatusCache(): void {
  gitStatusCache = null;
}

export async function fetchGitStatus(rootPath: string): Promise<Map<string, string>> {
  if (gitStatusCache && gitStatusCache.rootPath === rootPath) {
    return gitStatusCache.status;
  }
  try {
    const { getEnv } = await import("@my-agent/core");
    const result = await getEnv().runCommand("git status --porcelain", {
      cwd: rootPath,
    });
    const status = parseGitStatus(result.stdout);
    gitStatusCache = { rootPath, status };
    return status;
  } catch {
    return new Map();
  }
}

function lookupGitStatus(gitStatus: Map<string, string>, rootPath: string, fullPath: string): string | undefined {
  const relative = workspaceRelativePath(rootPath, fullPath);
  return gitStatus.get(relative) ?? gitStatus.get(relative.replace(/\\/g, "/"));
}

// ============================================================================
// Status Style
// ============================================================================

interface StatusStyle {
  label: string;
  color: string;
}

function getStatusStyle(status: string): StatusStyle | null {
  const s = status.trim();
  if (s.startsWith("M") || s.endsWith("M")) return { label: "M", color: COLORS.warning };
  if (s === "??") return { label: "?", color: COLORS.success };
  if (s.startsWith("A")) return { label: "A", color: COLORS.success };
  if (s.startsWith("D")) return { label: "D", color: COLORS.danger };
  if (s.startsWith("R")) return { label: "R", color: COLORS.primary };
  if (s.startsWith("C")) return { label: "C", color: COLORS.primary };
  return null;
}

// ============================================================================
// Flat Tree Item
// ============================================================================

export interface FlatTreeItem {
  path: string;
  name: string;
  indent: number;
  type: "file" | "directory";
  expanded: boolean;
}

// ============================================================================
// useFileTree
// ============================================================================

export function useFileTree(rootPath: string): {
  items: FlatTreeItem[];
  loading: boolean;
  toggleDir: (path: string) => Promise<void>;
  reload: () => void;
} {
  const [dirData, setDirData] = useState<Map<string, FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const loadDir = useCallback(async (path: string): Promise<void> => {
    if (dirCache.has(path)) {
      setDirData((prev) => new Map(prev).set(path, dirCache.get(path)!));
      return;
    }
    try {
      const { getEnv } = await import("@my-agent/core");
      const entries = sortEntries(await getEnv().fs.readdir(path));
      dirCache.set(path, entries);
      setDirData((prev) => new Map(prev).set(path, entries));
    } catch {
      dirCache.set(path, []);
      setDirData((prev) => new Map(prev).set(path, []));
    }
  }, []);

  const toggleDir = useCallback(
    async (path: string): Promise<void> => {
      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      await loadDir(path);
      setExpanded((prev) => new Set(prev).add(path));
    },
    [expanded, loadDir]
  );

  const reload = useCallback(() => {
    clearDirCache();
    setDirData(new Map());
    setExpanded(new Set());
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    setLoading(true);
    loadDir(rootPath).then(() => {
      if (cancelled) return;
      setExpanded(new Set([rootPath]));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath, reloadToken, loadDir]);

  const items = useMemo(() => {
    const result: FlatTreeItem[] = [];

    function buildFlat(dirPath: string, indent: number): void {
      const entries = dirData.get(dirPath);
      if (!entries) return;
      for (const entry of entries) {
        const fullPath = joinWorkspacePath(dirPath, entry.name);
        if (entry.type === "directory") {
          const isExpanded = expanded.has(fullPath);
          result.push({ path: fullPath, name: entry.name, indent, type: "directory", expanded: isExpanded });
          if (isExpanded) buildFlat(fullPath, indent + 1);
        } else {
          result.push({ path: fullPath, name: entry.name, indent, type: "file", expanded: false });
        }
      }
    }

    if (rootPath && dirData.has(rootPath)) {
      buildFlat(rootPath, 0);
    }

    return result;
  }, [dirData, expanded, rootPath]);

  return { items, loading, toggleDir, reload };
}

// ============================================================================
// FileTree
// ============================================================================

interface FileTreeProps {
  items: FlatTreeItem[];
  gitStatus: Map<string, string>;
  rootPath: string;
  cursorIndex: number;
  selectedPath: string | null;
  scrollTop: number;
  visibleCount: number;
  loading: boolean;
}

export const FileTree = ({
  items,
  gitStatus,
  rootPath,
  cursorIndex,
  selectedPath,
  scrollTop,
  visibleCount,
  loading,
}: FileTreeProps) => {
  if (loading) return <Text color={COLORS.muted}>Loading tree...</Text>;
  if (items.length === 0)
    return (
      <Text color={COLORS.muted} dimColor>
        (empty directory)
      </Text>
    );

  const windowItems = items.slice(scrollTop, scrollTop + visibleCount);

  return (
    <Box flexDirection="column">
      {windowItems.map((item, offset) => {
        const index = scrollTop + offset;
        const isCursor = index === cursorIndex;
        const isSelected = item.type === "file" && selectedPath === item.path;
        const rowBg = isCursor ? BG.rowCursor : isSelected ? BG.rowSelected : undefined;
        const status = lookupGitStatus(gitStatus, rootPath, item.path);
        const style = status ? getStatusStyle(status) : null;
        const indent = "  ".repeat(item.indent);
        const rowColor = isCursor || isSelected ? COLORS.text : COLORS.muted;

        if (item.type === "directory") {
          const folderIcon = getFolderIconStyle(item.expanded, item.name);
          return (
            <Box key={item.path} flexShrink={0} height={1} width="100%" backgroundColor={rowBg}>
              <Text wrap="truncate">
                {indent}
                <Text color={rowColor}>{folderIcon.chevron}</Text>
                <Text color={folderIcon.color}>{formatFolderGlyph(folderIcon)}</Text>
                <Text color={rowColor}>{item.name}/</Text>
                {style && (
                  <Text color={style.color} bold>
                    {" "}
                    {style.label}
                  </Text>
                )}
              </Text>
            </Box>
          );
        }

        const icon = getFileIconStyle(item.path);
        return (
          <Box key={item.path} flexShrink={0} height={1} width="100%" backgroundColor={rowBg}>
            <Text wrap="truncate">
              {indent}
              <Text color={icon.color}>{formatIconGlyph(icon)}</Text>
              <Text color={rowColor}>{item.name}</Text>
              {style && (
                <Text color={style.color} bold>
                  {" "}
                  {style.label}
                </Text>
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
