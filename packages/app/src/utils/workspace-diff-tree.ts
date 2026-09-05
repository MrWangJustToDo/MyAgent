import { joinWorkspacePath } from "./workspace-path.js";

// ============================================================================
// Diff-only tree preprocessing
//
// In diff mode the sidebar shows only files that actually changed (git status),
// and the tree is preprocessed the way GitHub PR pages do it: directory chains
// that contain exactly one subdirectory are merged into a single row, e.g.
// "app/" + "src/" + "utils/" render as "app/src/utils/". Mirrors the `compress`
// logic of the reference generateDir.ts — only non-leaf single-child chains
// merge, and the first tree level is left untouched to avoid view ambiguity.
// ============================================================================

export interface FlatTreeItem {
  path: string;
  name: string;
  indent: number;
  type: "file" | "directory";
  expanded: boolean;
}

interface DiffTreeNode {
  /** Relative path — unique node id (for merged dirs: the deepest real dir). */
  key: string;
  /** Display name — a single segment, or merged segments for compressed dirs. */
  name: string;
  /** Absolute path of the underlying file/dir. */
  path: string;
  type: "file" | "directory";
  children: DiffTreeNode[];
}

/** Build the tree skeleton from changed relative paths only (no fs reads). */
function buildDiffTree(gitStatus: Map<string, string>, rootPath: string): DiffTreeNode[] {
  const roots: DiffTreeNode[] = [];
  const index = new Map<string, DiffTreeNode>();

  const relPaths = new Set<string>();
  for (const rel of gitStatus.keys()) {
    relPaths.add(rel.replace(/\\/g, "/"));
  }

  for (const relPath of relPaths) {
    const segments = relPath.split("/");
    let key = "";
    let siblings = roots;
    for (let i = 0; i < segments.length; i++) {
      const isLast = i === segments.length - 1;
      key = key ? `${key}/${segments[i]}` : segments[i];
      let node = index.get(key);
      if (!node) {
        node = {
          key,
          name: segments[i],
          path: joinWorkspacePath(rootPath, key),
          type: isLast ? "file" : "directory",
          children: [],
        };
        index.set(key, node);
        siblings.push(node);
      }
      if (!isLast) siblings = node.children;
    }
  }

  return roots;
}

function sortDiffChildren(nodes: DiffTreeNode[]): DiffTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Merge single-subdirectory chains into one node (generateDir.ts `compress`):
 * a directory whose only child is another directory collapses into
 * `parentName/childName` with the grandchild children. Files are never merged.
 */
function compressDiffTree(nodes: DiffTreeNode[]): DiffTreeNode[] {
  const result: DiffTreeNode[] = [];
  for (const node of sortDiffChildren(nodes)) {
    if (node.type !== "directory") {
      result.push(node);
      continue;
    }
    const children = compressDiffTree(node.children);
    if (children.length === 1 && children[0].type === "directory") {
      const child = children[0];
      result.push({
        key: child.key,
        name: `${node.name}/${child.name}`,
        path: child.path,
        type: "directory",
        children: child.children,
      });
    } else {
      result.push({ ...node, children });
    }
  }
  return result;
}

function flattenDiffTree(nodes: DiffTreeNode[], indent: number, collapsed: Set<string>, out: FlatTreeItem[]): void {
  for (const node of nodes) {
    const isDir = node.type === "directory";
    const isExpanded = !collapsed.has(node.key);
    out.push({
      path: node.path,
      name: node.name,
      indent,
      type: isDir ? "directory" : "file",
      expanded: isDir && isExpanded,
    });
    if (isDir && isExpanded) flattenDiffTree(node.children, indent + 1, collapsed, out);
  }
}

/**
 * Build the flattened diff-only tree from the git status map.
 *
 * - Only changed paths become rows (untracked, modified, added, deleted,
 *   renamed — whatever `git status --porcelain` reported).
 * - The first tree level is kept unmerged; deeper single-subdirectory chains
 *   are compressed (GitHub PR style).
 * - Directories default to expanded; pass their relative paths in `collapsed`
 *   to hide them.
 *
 * @param gitStatus relative path → status code map (see `parseGitStatus`)
 * @param rootPath workspace root
 * @param collapsed relative paths of directories the user collapsed
 */
export function buildDiffTreeItems(
  gitStatus: Map<string, string>,
  rootPath: string,
  collapsed: Set<string>
): FlatTreeItem[] {
  if (!rootPath || gitStatus.size === 0) return [];
  const roots = sortDiffChildren(buildDiffTree(gitStatus, rootPath)).map((root) =>
    root.type === "directory" ? { ...root, children: compressDiffTree(root.children) } : root
  );
  const out: FlatTreeItem[] = [];
  flattenDiffTree(roots, 0, collapsed, out);
  return out;
}
