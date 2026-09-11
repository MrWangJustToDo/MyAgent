import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSize } from "../hooks/use-size.js";
import { useWorkspaceGit } from "../hooks/use-workspace-git.js";
import { useWorkspaceView } from "../hooks/use-workspace-view.js";
import { COLORS } from "../theme/colors.js";
import { workspacePanelHint } from "../utils/keyboard-labels.js";
import { clearWorkspaceDiffStatsCache } from "../utils/workspace-diff-stats.js";
import { orderedChangedFiles } from "../utils/workspace-diff-tree.js";
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
  const { items: diffItems, toggleDir: toggleDiffDir } = useDiffFileTree(gitStatus, rootPath);

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
  // Order follows the rendered tree (directories first, case-insensitive), not a
  // plain path sort, so navigation moves top-to-bottom as shown. Uses the full
  // changed-file set (not the visible rows) so it works even where a changed
  // file's directory is collapsed — the target is revealed + scrolled by the
  // selectedPath effect below.
  const jumpToChanged = useCallback(
    (direction: 1 | -1) => {
      const changed = orderedChangedFiles(gitStatus, rootPath);
      if (changed.length === 0) return;
      const cur = selectedPath ? changed.indexOf(selectedPath) : -1;
      let next: number;
      if (direction > 0) next = cur < 0 ? 0 : cur + 1 >= changed.length ? 0 : cur + 1;
      else next = cur < 0 ? changed.length - 1 : cur - 1 < 0 ? changed.length - 1 : cur - 1;
      const target = changed[next]!;
      if (target === selectedPath) return;
      selectFile(target);
    },
    [gitStatus, rootPath, selectedPath, selectFile]
  );

  useEffect(() => {
    import("@my-agent/core").then(({ getEnv }) => setRootPath(getEnv().rootPath)).catch(() => {});
  }, []);

  useEffect(() => {
    setCursorIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    if (!selectedPath) return;
    // In the full-tree view, ensure the selected file's ancestor directories are
    // expanded so it is present in `items` (and can be scrolled into view).
    if (!isDiffMode && !revealedRef.current.has(selectedPath)) {
      revealedRef.current.add(selectedPath);
      void revealPath(selectedPath);
    }
    const index = items.findIndex((item) => item.path === selectedPath);
    if (index < 0) return;
    setCursorIndex(index);
    const currentScroll = useWorkspaceView.getReadonlyState().treeScrollTop;
    setTreeScrollTop(ensureIndexVisible(index, currentScroll, paneBodyLines, items.length));
    // Re-run when items change (post-reveal / mode switch) so the reveal + scroll
    // settle on a location the file is actually present in.
  }, [selectedPath, items, isDiffMode, revealPath, paneBodyLines, setTreeScrollTop]);

  // Full manual refresh: drop every cache, reload the tree, reset pane scroll and
  // re-fetch git state.
  const refreshAll = useCallback(() => {
    clearDirCache();
    clearGitStatusCache();
    clearWorkspaceDiffStatsCache();
    clearWorkspaceFileListCache();
    clearContentCache();
    clearWorkspaceDiffCache();
    reload();
    scrollActivePane("top");
    setRefreshToken((t) => t + 1);
    revealedRef.current.clear();
    void refreshGit(rootPath);
  }, [reload, scrollActivePane, refreshGit, rootPath]);

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
