import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSize } from "../hooks/use-size.js";
import { useWorkspaceGit } from "../hooks/use-workspace-git.js";
import { useWorkspaceView } from "../hooks/use-workspace-view.js";
import { COLORS } from "../theme/colors.js";
import { workspacePanelHint } from "../utils/keyboard-labels.js";
import { clearWorkspaceDiffStatsCache } from "../utils/workspace-diff-stats.js";
import { changedFileJumpTarget } from "../utils/workspace-diff-tree.js";
import { clearWorkspaceFileListCache } from "../utils/workspace-file-search.js";
import { clearWorkspaceDiffCache } from "../utils/workspace-git-diff.js";
import { clearGitStatusCache } from "../utils/workspace-git-status.js";
import { ensureIndexVisible } from "../utils/workspace-scroll.js";

import { clearContentCache } from "./FileContent.js";
import { clearDirCache, computeDirStatuses, FileTree, useDiffFileTree, useFileTree } from "./FileTree.js";
import { HEADER_LINES, WorkspaceModeHeader } from "./WorkspaceModeHeader.js";
import { PANE_TITLE_LINES, WorkspacePane } from "./WorkspacePane.js";
import { WorkspacePreviewPane } from "./WorkspacePreviewPane.js";
import { WorkspaceQuickOpen } from "./WorkspaceQuickOpen.js";

import type { CodeViewRef, DiffViewRef } from "@git-diff-view/cli";
import type { Key } from "ink";

// ============================================================================
// Constants
// ============================================================================

const TREE_WIDTH_RATIO = 0.34;
const MIN_TREE_WIDTH = 28;
const MIN_PREVIEW_WIDTH = 24;
const FOOTER_LINES = 1;
const PREVIEW_SCROLL_STEP = 3;

// ============================================================================
// File mode
// ============================================================================

export const WorkspaceFileMode = () => {
  const paneFocus = useWorkspaceView((s) => s.paneFocus);
  const mode = useWorkspaceView((s) => s.mode);
  const selectedPath = useWorkspaceView((s) => s.selectedPath);
  const treeScrollTop = useWorkspaceView((s) => s.treeScrollTop);
  const quickOpen = useWorkspaceView((s) => s.quickOpen);
  const { close, openQuickOpen, selectFile, setPaneFocus, toggleMode, setTreeScrollTop } =
    useWorkspaceView.getActions();

  const previewRef = useRef<CodeViewRef>(null);
  const diffRef = useRef<DiffViewRef>(null);
  // Paths we've already asked revealPath to expand, so the reveal effect resolves
  // once `items` recomputes without re-firing the async load every render.
  const revealedRef = useRef<Set<string>>(new Set());

  const [rootPath, setRootPath] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const { gitStatus, gitInfo, diffStats, refreshGit } = useWorkspaceGit(rootPath);

  const screenWidth = useSize((s) => s.state.screenWidth);
  const screenHeight = useSize((s) => s.state.screenHeight) || 24;

  const bodyHeight = Math.max(10, screenHeight - HEADER_LINES - FOOTER_LINES);
  const paneBodyLines = Math.max(4, bodyHeight - PANE_TITLE_LINES - 2);
  const treeWidth = Math.max(MIN_TREE_WIDTH, Math.floor(screenWidth * TREE_WIDTH_RATIO));
  const previewWidth = Math.max(MIN_PREVIEW_WIDTH, screenWidth - treeWidth - 2);

  const isDiffMode = mode === "diff";

  const { items: fullItems, loading: treeLoading, toggleDir, reload, revealPath } = useFileTree(rootPath);
  const {
    items: diffItems,
    toggleDir: toggleDiffDir,
    revealDiffDirs,
    resetDiffCollapsed,
  } = useDiffFileTree(gitStatus, rootPath);

  // Diff mode lists only changed files (preprocessed, merged-prefix tree);
  // preview mode shows the full workspace tree.
  const items = isDiffMode ? diffItems : fullItems;
  const handleToggleDir = isDiffMode ? toggleDiffDir : toggleDir;

  const dirStatuses = useMemo(() => computeDirStatuses(gitStatus, rootPath), [gitStatus, rootPath]);

  const scrollActivePane = useCallback(
    (direction: "up" | "down" | "top") => {
      const ref = mode === "preview" ? previewRef.current : diffRef.current;
      if (!ref) return;
      if (direction === "top") ref.scrollToTop(1);
      else if (direction === "up") ref.scrollUp({ step: PREVIEW_SCROLL_STEP });
      else ref.scrollDown({ step: PREVIEW_SCROLL_STEP });
    },
    [mode]
  );

  const moveCursor = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, Math.max(0, items.length - 1)));
      setCursorIndex(clamped);
      const currentScroll = useWorkspaceView.getReadonlyState().treeScrollTop;
      setTreeScrollTop(ensureIndexVisible(clamped, currentScroll, paneBodyLines, items.length));
    },
    [items.length, paneBodyLines, setTreeScrollTop]
  );

  // Jump between files that have git changes (`[` / `]`), wrapping around.
  //
  // The decision (walk order, wrap-around, reveal chain) is a pure function in
  // `workspace-diff-tree` so it can be pinned by tests; this only applies it. A
  // hidden target is expanded first because its row is absent from `items` —
  // otherwise the cursor would move nowhere while the preview still rendered the
  // file, reading as the jump silently doing nothing. In the full-tree view
  // `revealPath` is the effect's job (keyed off `selectedPath`), so only the
  // diff pane needs the keys.
  const jumpToChanged = useCallback(
    (direction: 1 | -1) => {
      const jump = changedFileJumpTarget(gitStatus, rootPath, selectedPath, direction);
      if (!jump) return;
      if (isDiffMode) revealDiffDirs(jump.revealKeys);
      selectFile(jump.target);
    },
    [gitStatus, rootPath, selectedPath, selectFile, isDiffMode, revealDiffDirs]
  );

  useEffect(() => {
    import("@codent/core").then(({ getEnv }) => setRootPath(getEnv().rootPath)).catch(() => {});
  }, []);

  useEffect(() => {
    setCursorIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Full-tree view: expand the target's ancestor chain so it becomes a row.
  //
  // `revealedRef` holds only paths whose reveal is unconfirmed — it is cleared
  // once the row appears (below) rather than being a permanent "already done"
  // marker. That way a reveal that did not produce a row is retried, while one
  // that did is never repeated: the second run sees the row and clears the flag
  // without re-adding it. (Permanent markers are what make a failed reveal
  // unrecoverable; retrying unconditionally would instead loop, since
  // `revealPath` always writes new Sets into `useFileTree` and those `items` are
  // this effect's dependency.)
  //
  // Diff mode does not reveal here: a `[`/`]` jump calls `revealDiffDirs` before
  // selecting, because the row it would read the chain from is exactly the row a
  // collapsed ancestor removed.
  useEffect(() => {
    if (!selectedPath) return;
    const index = items.findIndex((item) => item.path === selectedPath);

    // Row is present: the reveal (if any) is confirmed done.
    if (index >= 0) {
      revealedRef.current.delete(selectedPath);
      setCursorIndex(index);
      const currentScroll = useWorkspaceView.getReadonlyState().treeScrollTop;
      setTreeScrollTop(ensureIndexVisible(index, currentScroll, paneBodyLines, items.length));
      return;
    }

    // Row missing: reveal it (once per unconfirmed path). The settle-after-commit
    // re-run then either finds the row or retries a reveal that failed.
    if (!isDiffMode && !revealedRef.current.has(selectedPath)) {
      revealedRef.current.add(selectedPath);
      void revealPath(selectedPath);
    }
    // Re-run when items change (post-reveal / mode switch) so the reveal + scroll
    // settle on a location the file is actually present in.
  }, [selectedPath, items, isDiffMode, revealPath, paneBodyLines, setTreeScrollTop]);

  // Full manual refresh: drop every cache, reload the tree, reset pane scroll,
  // collapse state in BOTH trees, and re-fetch git state.
  const refreshAll = useCallback(() => {
    clearDirCache();
    clearGitStatusCache();
    clearWorkspaceDiffStatsCache();
    clearWorkspaceFileListCache();
    clearContentCache();
    clearWorkspaceDiffCache();
    reload();
    // Diff mode's collapse state lives in `useDiffFileTree`, not in the store, so
    // `reload()` above does not touch it — without this the diff tree would keep
    // directories collapsed across a refresh while the full tree resets.
    resetDiffCollapsed();
    scrollActivePane("top");
    setRefreshToken((t) => t + 1);
    revealedRef.current.clear();
    void refreshGit(rootPath);
  }, [reload, scrollActivePane, refreshGit, rootPath, resetDiffCollapsed]);

  /** Keybindings that work regardless of which pane has focus. Returns true when handled. */
  const handleGlobalKey = useCallback(
    (inputChar: string, key: Key): boolean => {
      if (key.tab) {
        toggleMode();
        return true;
      }
      if (key.escape) {
        close();
        return true;
      }
      if (inputChar === "r" && !key.ctrl) {
        refreshAll();
        return true;
      }
      if (key.ctrl && inputChar === "p") {
        openQuickOpen();
        return true;
      }
      if (inputChar === "]" || inputChar === "[") {
        jumpToChanged(inputChar === "]" ? 1 : -1);
        return true;
      }
      return false;
    },
    [toggleMode, close, refreshAll, openQuickOpen, jumpToChanged]
  );

  /** Tree-pane navigation (arrows expand/select, enter toggles). */
  const handleTreeKey = useCallback(
    (key: Key) => {
      if (key.upArrow) {
        moveCursor(cursorIndex - 1);
        return;
      }
      if (key.downArrow) {
        moveCursor(cursorIndex + 1);
        return;
      }
      if (key.rightArrow) {
        const current = items[cursorIndex];
        if (!current) return;
        if (current.type === "directory") {
          if (!current.expanded) {
            void handleToggleDir(current.path);
            return;
          }
          setPaneFocus("preview");
          return;
        }
        if (selectedPath === current.path) {
          setPaneFocus("preview");
          return;
        }
        selectFile(current.path);
        return;
      }
      if (key.leftArrow) {
        const current = items[cursorIndex];
        if (current?.type === "directory" && current.expanded) {
          void handleToggleDir(current.path);
          return;
        }
        if (current && current.indent > 0) {
          for (let i = cursorIndex - 1; i >= 0; i--) {
            const candidate = items[i];
            if (candidate && candidate.indent === current.indent - 1) {
              moveCursor(i);
              break;
            }
          }
        }
        return;
      }
      if (key.return) {
        const current = items[cursorIndex];
        if (!current) return;
        if (current.type === "directory") void handleToggleDir(current.path);
        else selectFile(current.path);
      }
    },
    [cursorIndex, items, moveCursor, handleToggleDir, selectedPath, selectFile, setPaneFocus]
  );

  /** Preview-pane navigation (scroll the file/diff, ← returns to the tree). */
  const handlePreviewKey = useCallback(
    (key: Key) => {
      if (key.leftArrow) {
        setPaneFocus("tree");
        return;
      }
      if (key.rightArrow) return;
      if (!selectedPath) return;
      if (key.upArrow) {
        scrollActivePane("up");
        return;
      }
      if (key.downArrow) scrollActivePane("down");
    },
    [selectedPath, scrollActivePane, setPaneFocus]
  );

  useInput((inputChar, key) => {
    // The quick-open overlay owns the keyboard while it is up.
    if (quickOpen) return;
    if (handleGlobalKey(inputChar, key)) return;
    if (paneFocus === "tree") handleTreeKey(key);
    else handlePreviewKey(key);
  });

  return (
    <Box flexDirection="column" flexGrow={1} width={screenWidth} height={bodyHeight + HEADER_LINES + FOOTER_LINES}>
      <WorkspaceModeHeader mode={mode} rootPath={rootPath} gitInfo={gitInfo} diffStats={diffStats} />

      {quickOpen ? (
        <WorkspaceQuickOpen rootPath={rootPath} width={screenWidth} height={bodyHeight} />
      ) : (
        <Box flexDirection="row" flexGrow={1} height={bodyHeight} gap={0}>
          <WorkspacePane active={paneFocus === "tree"} width={treeWidth} height={bodyHeight}>
            <FileTree
              items={items}
              gitStatus={gitStatus}
              dirStatuses={dirStatuses}
              rootPath={rootPath}
              cursorIndex={cursorIndex}
              selectedPath={selectedPath}
              scrollTop={treeScrollTop}
              visibleCount={paneBodyLines}
              loading={isDiffMode ? gitStatus.size === 0 && treeLoading : treeLoading}
              emptyLabel={isDiffMode ? "(no changes)" : undefined}
              diffStats={diffStats?.files ?? null}
            />
          </WorkspacePane>

          <WorkspacePane active={paneFocus === "preview"} width={undefined} height={bodyHeight}>
            <WorkspacePreviewPane
              mode={mode}
              rootPath={rootPath}
              selectedPath={selectedPath}
              refreshToken={refreshToken}
              width={previewWidth - 2}
              height={paneBodyLines}
              previewRef={previewRef}
              diffRef={diffRef}
            />
          </WorkspacePane>
        </Box>
      )}

      <Box flexShrink={0} height={FOOTER_LINES} paddingX={1}>
        <Text color={COLORS.muted} dimColor>
          {workspacePanelHint()}
        </Text>
      </Box>
    </Box>
  );
};
