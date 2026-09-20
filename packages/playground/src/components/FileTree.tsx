import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureLoaded, getIconUrlSync } from "../hooks/use-icon-theme.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { IconFolder, IconUpload } from "../ui/icons.js";
import { State } from "../ui/State.js";

import type { WebContainer } from "@webcontainer/api";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".cache"]);
/**
 * Width of one indent level, in px.
 *
 * Only used to size the `.tree__guides` spacer (and its guide ticks). The icon and
 * name columns come from the row's flex layout, so this value does not need to be
 * kept in sync with any CSS variable.
 */
const INDENT_WIDTH = 14;

interface DirEntry {
  name: string;
  type: "directory" | "file";
}

interface FileTreeProps {
  wc: WebContainer;
  rootPath: string;
  onSelect: (path: string) => void;
  refreshKey: number;
  selectedPath?: string | null;
  /** Opens the host file picker — used by the empty state's call to action. */
  onRequestUpload?: () => void;
}

/** Flattened view of the visible tree — the unit of keyboard navigation. */
interface FlatRow {
  path: string;
  entry: DirEntry;
  depth: number;
}

function sortEntries(entries: DirEntry[]): DirEntry[] {
  const dirs = entries.filter((e) => e.type === "directory").sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function joinPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function isAncestorPath(ancestor: string, target: string | null | undefined): boolean {
  if (!target) return false;
  return target === ancestor || target.startsWith(`${ancestor}/`);
}

function IndentGuides({ depth, indent }: { depth: number; indent: number }) {
  if (depth <= 0) return null;
  return (
    <div className="tree__guides" style={{ width: depth * indent }} aria-hidden="true">
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="tree__guide" />
      ))}
    </div>
  );
}

function Chevron({ open, loading }: { open: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <span className="tree__chevron" aria-hidden="true">
        <span className="spinner spinner--sm" />
      </span>
    );
  }
  return (
    <span className={cx("tree__chevron", open && "tree__chevron--open")} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M3.5 1.5 7 5l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * Workspace file tree.
 *
 * Directory contents live in a `path → entries` map and expansion is a separate
 * `Set` of directory paths, rather than expansion flags baked into a rebuilt tree.
 * That split is what keeps the tree stable: a refresh re-reads the directories that
 * are *currently open* and leaves them open, so agent activity no longer collapses
 * what the user expanded or scrolls the viewport out from under them.
 */
export const FileTree = ({ wc, rootPath, onSelect, refreshKey, selectedPath, onRequestUpload }: FileTreeProps) => {
  const [childrenByDir, setChildrenByDir] = useState<ReadonlyMap<string, DirEntry[]>>(() => new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<ReadonlySet<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [iconsReady, setIconsReady] = useState(false);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  // Read through refs so the refresh callback never needs to be re-created (a new
  // identity would re-trigger the refresh effect and loop).
  const expandedRef = useRef(expanded);
  const refreshingRef = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  expandedRef.current = expanded;

  useEffect(() => {
    void ensureLoaded().then(() => setIconsReady(true));
  }, []);

  const loadDir = useCallback(
    async (dirPath: string): Promise<DirEntry[]> => {
      const entries = await wc.fs.readdir(dirPath, { withFileTypes: true });
      return sortEntries(
        entries
          .filter((e) => !SKIP_DIRS.has(e.name))
          .map((e) => ({ name: e.name, type: e.isDirectory() ? ("directory" as const) : ("file" as const) }))
      );
    },
    [wc.fs]
  );

  /**
   * Re-read the root plus every currently expanded directory.
   *
   * A directory that has disappeared (or become unreadable) is dropped from the map
   * instead of failing the whole refresh.
   */
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const dirs = [rootPath, ...expandedRef.current];
      const results = await Promise.all(
        dirs.map(async (dir) => {
          try {
            return [dir, await loadDir(dir)] as const;
          } catch {
            return [dir, null] as const;
          }
        })
      );

      const next = new Map<string, DirEntry[]>();
      for (const [dir, entries] of results) {
        if (entries) next.set(dir, entries);
      }

      setChildrenByDir(next);
      setExpanded((prev) => {
        const kept = new Set([...prev].filter((p) => next.has(p)));
        return kept.size === prev.size ? prev : kept;
      });
    } finally {
      refreshingRef.current = false;
      setReady(true);
    }
  }, [rootPath, loadDir]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const toggleDir = useCallback(
    async (dirPath: string) => {
      if (expandedRef.current.has(dirPath)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
        return;
      }

      // Always re-read on expand. A cached directory can be stale: a refresh only
      // re-reads the directories that were open at the time, and a collapsed one is
      // not among them. A readdir is cheap, and showing the previous contents would
      // be the more visible bug.
      setLoadingDirs((prev) => new Set(prev).add(dirPath));
      try {
        const entries = await loadDir(dirPath);
        setChildrenByDir((prev) => new Map(prev).set(dirPath, entries));
        setExpanded((prev) => new Set(prev).add(dirPath));
      } catch {
        // Unreadable / removed between listing and open — leave it collapsed.
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [loadDir]
  );

  const rows = useMemo(() => {
    const build = (dirPath: string, depth: number): FlatRow[] => {
      const entries = childrenByDir.get(dirPath);
      if (!entries) return [];
      const out: FlatRow[] = [];
      for (const entry of entries) {
        const path = joinPath(dirPath, entry.name);
        out.push({ path, entry, depth });
        if (entry.type === "directory" && expanded.has(path)) {
          out.push(...build(path, depth + 1));
        }
      }
      return out;
    };
    return build(rootPath, 0);
  }, [childrenByDir, expanded, rootPath]);

  // Keep exactly one row in the tab order, defaulting to the selected file.
  const rovingPath =
    focusedPath && rows.some((r) => r.path === focusedPath) ? focusedPath : (selectedPath ?? rows[0]?.path ?? null);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setFocusedPath(row.path);
      rowRefs.current.get(row.path)?.focus();
    },
    [rows]
  );

  const onRowKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number, row: FlatRow) => {
      const isDir = row.entry.type === "directory";
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusRow(Math.min(index + 1, rows.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          focusRow(Math.max(index - 1, 0));
          break;
        case "ArrowRight":
          if (!isDir) return;
          event.preventDefault();
          if (!expanded.has(row.path)) void toggleDir(row.path);
          else focusRow(Math.min(index + 1, rows.length - 1));
          break;
        case "ArrowLeft":
          if (!isDir) return;
          event.preventDefault();
          if (expanded.has(row.path)) void toggleDir(row.path);
          break;
        case "Home":
          event.preventDefault();
          focusRow(0);
          break;
        case "End":
          event.preventDefault();
          focusRow(rows.length - 1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          setFocusedPath(row.path);
          if (isDir) void toggleDir(row.path);
          else onSelect(row.path);
          break;
        default:
          break;
      }
    },
    [rows, expanded, focusRow, toggleDir, onSelect]
  );

  if (!iconsReady) {
    return <State loading title="Loading file icons" />;
  }

  // Skeleton only on the very first load: re-rendering it on every agent write
  // replaced the whole tree (and reset scroll) while the user was reading it.
  if (!ready) {
    return (
      <div className="tree tree--skeleton" aria-busy="true" aria-label="Loading files">
        {[72, 54, 84, 46, 64, 38].map((width, i) => (
          <div key={i} className="skeleton skeleton--row" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <State
        icon={<IconFolder size={18} />}
        title="Empty workspace"
        hint="Upload files, or let the agent scaffold a project."
        action={
          onRequestUpload && (
            <Button size="sm" icon={<IconUpload size={13} />} onClick={onRequestUpload}>
              Upload files
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="tree" role="tree" aria-label="Workspace files">
      {rows.map((row, index) => {
        const isDir = row.entry.type === "directory";
        const selected = selectedPath === row.path;
        const open = expanded.has(row.path);
        const iconUrl = getIconUrlSync(row.entry.name, isDir);
        return (
          <div
            key={row.path}
            ref={(el) => {
              if (el) rowRefs.current.set(row.path, el);
              else rowRefs.current.delete(row.path);
            }}
            role="treeitem"
            aria-selected={selected}
            aria-expanded={isDir ? open : undefined}
            aria-level={row.depth + 1}
            aria-busy={loadingDirs.has(row.path) || undefined}
            tabIndex={row.path === rovingPath ? 0 : -1}
            className={[
              "tree__row",
              isDir ? "tree__row--dir" : "tree__row--file",
              selected && "tree__row--selected",
              !selected && isAncestorPath(row.path, selectedPath) && "tree__row--ancestor",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              setFocusedPath(row.path);
              if (isDir) void toggleDir(row.path);
              else onSelect(row.path);
            }}
            onKeyDown={(e) => onRowKeyDown(e, index, row)}
          >
            <IndentGuides depth={row.depth} indent={INDENT_WIDTH} />
            {isDir ? (
              <Chevron open={open} loading={loadingDirs.has(row.path)} />
            ) : (
              <span className="tree__chevron tree__chevron--spacer" />
            )}
            {iconUrl ? (
              <img className="tree__icon" src={iconUrl} alt="" draggable={false} />
            ) : (
              <span className="tree__icon tree__icon--fallback" aria-hidden="true" />
            )}
            <span className="tree__name truncate">{row.entry.name}</span>
          </div>
        );
      })}
    </div>
  );
};
