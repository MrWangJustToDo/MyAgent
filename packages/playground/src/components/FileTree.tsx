import { useCallback, useEffect, useRef, useState } from "react";

import { ensureLoaded, getIconUrlSync } from "../hooks/use-icon-theme.js";

import type { WebContainer } from "@webcontainer/api";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".cache"]);

interface DirEntry {
  name: string;
  type: "directory" | "file";
}

interface TreeNode {
  name: string;
  type: "directory" | "file";
  children?: TreeNode[];
  expanded?: boolean;
}

interface FileTreeProps {
  wc: WebContainer;
  rootPath: string;
  onSelect: (path: string) => void;
  refreshKey: number;
  selectedPath?: string | null;
}

function sortEntries(entries: DirEntry[]): DirEntry[] {
  const dirs = entries.filter((e) => e.type === "directory").sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function TreeNodeRow({
  node,
  path,
  depth,
  onToggle,
  onSelect,
  selected,
}: {
  node: TreeNode;
  path: string;
  depth: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  selected: boolean;
}) {
  const iconUrl = getIconUrlSync(node.name, node.type === "directory");

  const handleClick = useCallback(() => {
    if (node.type === "directory") {
      onToggle(path);
    } else {
      onSelect(path);
    }
  }, [node.type, path, onToggle, onSelect]);

  return (
    <div className={`file-tree__item ${selected ? "file-tree__item--selected" : ""}`} onClick={handleClick}>
      <div className="file-tree__indent" style={{ width: depth * 12 }} />
      {iconUrl && <img className="file-tree__icon" src={iconUrl} alt="" />}
      <span className="file-tree__name">{node.name}</span>
    </div>
  );
}

export const FileTree = ({ wc, rootPath, onSelect, refreshKey, selectedPath }: FileTreeProps) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [iconsReady, setIconsReady] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    ensureLoaded().then(() => setIconsReady(true));
  }, []);

  const loadDir = useCallback(
    async (dirPath: string): Promise<TreeNode[]> => {
      const entries = await wc.fs.readdir(dirPath, { withFileTypes: true });
      const filtered = entries.filter((e) => !SKIP_DIRS.has(e.name));
      const sorted = sortEntries(
        filtered.map((e) => ({ name: e.name, type: e.isDirectory() ? ("directory" as const) : ("file" as const) }))
      );
      return sorted;
    },
    [wc.fs]
  );

  const buildRoot = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const entries = await loadDir(rootPath);
      setTree(entries);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [rootPath, loadDir]);

  useEffect(() => {
    void buildRoot();
  }, [buildRoot, refreshKey]);

  const handleToggle = useCallback(
    async (dirPath: string) => {
      const parts = dirPath.replace(rootPath, "").replace(/^\//, "").split("/").filter(Boolean);
      if (parts.length === 0) return;

      const updateChildren = async (nodes: TreeNode[], depth: number): Promise<TreeNode[]> => {
        if (depth >= parts.length - 1) {
          return Promise.all(
            nodes.map(async (n) => {
              if (n.name === parts[depth] && n.type === "directory") {
                if (n.expanded) {
                  return { ...n, expanded: false, children: undefined };
                }
                const children = await loadDir(dirPath);
                return { ...n, expanded: true, children };
              }
              return n;
            })
          );
        }
        return Promise.all(
          nodes.map(async (n) => {
            if (n.name === parts[depth] && n.type === "directory") {
              return { ...n, children: await updateChildren(n.children ?? [], depth + 1) };
            }
            return n;
          })
        );
      };

      setTree((prev) => {
        void updateChildren(prev, 0).then(setTree);
        return prev;
      });
    },
    [rootPath, loadDir]
  );

  const renderNodes = (nodes: TreeNode[], depth: number, parentPath: string): React.ReactNode[] => {
    return nodes.flatMap((node) => {
      const nodePath = parentPath === "/" ? `/${node.name}` : `${parentPath}/${node.name}`;
      const isSelected = selectedPath === nodePath;
      const rows: React.ReactNode[] = [
        <TreeNodeRow
          key={nodePath}
          node={node}
          path={nodePath}
          depth={depth}
          onSelect={onSelect}
          onToggle={handleToggle}
          selected={isSelected}
        />,
      ];
      if (node.type === "directory" && node.expanded && node.children) {
        rows.push(...renderNodes(node.children, depth + 1, nodePath));
      }
      return rows;
    });
  };

  if (!iconsReady) {
    return <div className="file-tree__loading">Loading icons…</div>;
  }

  if (loading) {
    return <div className="file-tree__loading">Loading…</div>;
  }

  if (tree.length === 0) {
    return <div className="file-tree__empty">Empty workspace</div>;
  }

  return <div className="file-tree">{renderNodes(tree, 0, rootPath)}</div>;
};
