import { useCallback, useEffect, useRef, useState } from "react";

import { ensureLoaded, getIconUrlSync } from "../hooks/use-icon-theme.js";

import type { WebContainer } from "@webcontainer/api";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".cache"]);
const GUIDE_WIDTH = 14;

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

function isAncestorPath(ancestor: string, target: string | null | undefined): boolean {
  if (!target) return false;
  return target === ancestor || target.startsWith(`${ancestor}/`);
}

function IndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <div className="file-tree__guides" style={{ width: depth * GUIDE_WIDTH }} aria-hidden="true">
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="file-tree__guide" />
      ))}
    </div>
  );
}

function ChevronIcon({ open, loading }: { open: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <span className="file-tree__chevron file-tree__chevron--loading" aria-hidden="true">
        <span className="file-tree__spinner" />
      </span>
    );
  }
  return (
    <span className={`file-tree__chevron ${open ? "file-tree__chevron--open" : ""}`} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M3.5 1.5L7 5L3.5 8.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function TreeNodeRow({
  node,
  path,
  depth,
  onToggle,
  onSelect,
  selected,
  activePath,
  loading,
}: {
  node: TreeNode;
  path: string;
  depth: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  selected: boolean;
  activePath: boolean;
  loading: boolean;
}) {
  const iconUrl = getIconUrlSync(node.name, node.type === "directory");
  const isDir = node.type === "directory";

  const handleActivate = useCallback(() => {
    if (isDir) {
      onToggle(path);
    } else {
      onSelect(path);
    }
  }, [isDir, path, onToggle, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate]
  );

  const className = [
    "file-tree__item",
    isDir ? "file-tree__item--dir" : "file-tree__item--file",
    selected ? "file-tree__item--selected" : "",
    !selected && activePath ? "file-tree__item--active-path" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      role="treeitem"
      tabIndex={0}
      aria-selected={selected}
      aria-expanded={isDir ? Boolean(node.expanded) : undefined}
      aria-busy={loading || undefined}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <IndentGuides depth={depth} />
      {isDir ? (
        <ChevronIcon open={Boolean(node.expanded)} loading={loading} />
      ) : (
        <span className="file-tree__chevron file-tree__chevron--spacer" />
      )}
      {iconUrl ? (
        <img className="file-tree__icon" src={iconUrl} alt="" draggable={false} />
      ) : (
        <span className="file-tree__icon file-tree__icon--fallback" aria-hidden="true" />
      )}
      <span className="file-tree__name">{node.name}</span>
    </div>
  );
}

export const FileTree = ({ wc, rootPath, onSelect, refreshKey, selectedPath }: FileTreeProps) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [iconsReady, setIconsReady] = useState(false);
  const [expanding, setExpanding] = useState<Set<string>>(() => new Set());
  const loadingRef = useRef(false);
  const treeRef = useRef(tree);
  treeRef.current = tree;

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

      const current = treeRef.current;
      const willExpand = (() => {
        const walk = (nodes: TreeNode[], depth: number): boolean => {
          for (const n of nodes) {
            if (n.name !== parts[depth] || n.type !== "directory") continue;
            if (depth >= parts.length - 1) return !n.expanded;
            return walk(n.children ?? [], depth + 1);
          }
          return false;
        };
        return walk(current, 0);
      })();

      if (willExpand) {
        setExpanding((prev) => new Set(prev).add(dirPath));
      }

      try {
        setTree(await updateChildren(current, 0));
      } finally {
        if (willExpand) {
          setExpanding((prev) => {
            const next = new Set(prev);
            next.delete(dirPath);
            return next;
          });
        }
      }
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
          activePath={isAncestorPath(nodePath, selectedPath)}
          loading={expanding.has(nodePath)}
        />,
      ];
      if (node.type === "directory" && node.expanded && node.children) {
        rows.push(...renderNodes(node.children, depth + 1, nodePath));
      }
      return rows;
    });
  };

  if (!iconsReady) {
    return (
      <div className="file-tree__status">
        <span className="file-tree__spinner" />
        Loading icons…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-tree__status">
        <span className="file-tree__spinner" />
        Loading…
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="file-tree__status file-tree__status--empty">
        <span className="file-tree__status-title">Empty workspace</span>
        <span>Upload files or let the agent scaffold a project</span>
      </div>
    );
  }

  return (
    <div className="file-tree" role="tree" aria-label="Workspace files">
      {renderNodes(tree, 0, rootPath)}
    </div>
  );
};
