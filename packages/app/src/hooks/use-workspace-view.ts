import { createState } from "reactivity-store";

// ============================================================================
// Types
// ============================================================================

/** Right-pane content mode in the workspace file browser. */
export type WorkspaceMode = "preview" | "diff";

/** Left/right pane focus between file tree and preview/diff pane. */
export type WorkspacePaneFocus = "tree" | "preview";

export type WorkspaceView = "closed" | "workspace";

// ============================================================================
// State
// ============================================================================

export const CLOSE_DEBOUNCE_MS = 300;

export const useWorkspaceView = createState(
  () => ({
    view: "closed" as WorkspaceView,
    mode: "preview" as WorkspaceMode,
    paneFocus: "tree" as WorkspacePaneFocus,
    selectedPath: null as string | null,
    treeScrollTop: 0,
    lastClosedAt: 0,
  }),
  {
    withActions: (state) => ({
      open: () => {
        state.view = "workspace";
        state.mode = "preview";
        state.selectedPath = null;
        state.paneFocus = "tree";
        state.treeScrollTop = 0;
      },
      close: () => {
        state.view = "closed";
        state.selectedPath = null;
        state.lastClosedAt = Date.now();
      },
      selectFile: (path: string) => {
        state.selectedPath = path;
        state.paneFocus = "preview";
      },
      setMode: (mode: WorkspaceMode) => {
        state.mode = mode;
      },
      toggleMode: () => {
        state.mode = state.mode === "preview" ? "diff" : "preview";
      },
      setPaneFocus: (paneFocus: WorkspacePaneFocus) => {
        state.paneFocus = paneFocus;
      },
      togglePaneFocus: () => {
        state.paneFocus = state.paneFocus === "tree" ? "preview" : "tree";
      },
      setTreeScrollTop: (scrollTop: number) => {
        state.treeScrollTop = Math.max(0, scrollTop);
      },
    }),
    withNamespace: "useWorkspaceView",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
