import { getEnv } from "@my-agent/core";
import { createState } from "reactivity-store";

import { refreshKeyboardPlatform } from "../utils/keyboard-labels.js";
import { fetchWorkspaceGitInfo } from "../utils/workspace-git-info";

import type { WorkspaceGitInfo } from "../utils/workspace-git-info";

type WorkspaceInfo = {
  path: string;
  git?: WorkspaceGitInfo;
};

function shortenPath(rootPath: string): string {
  return rootPath.length > 40 ? `...${rootPath.slice(-37)}` : rootPath;
}

export const useWorkspaceInfo = createState(
  () => ({
    workspaceInfo: {
      path: "",
      git: undefined,
    } as WorkspaceInfo,
  }),
  {
    withActions: (s) => ({
      setWorkspaceInfo: (workspaceInfo: WorkspaceInfo) => {
        s.workspaceInfo = workspaceInfo;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

export const getWorkSpaceInfo = async () => {
  let path = "";

  let git = undefined;

  try {
    const rootPath = getEnv().rootPath;
    path = rootPath ? shortenPath(rootPath) : "";
    git = (await fetchWorkspaceGitInfo(rootPath)) || undefined;
    await refreshKeyboardPlatform();
  } catch {
    void 0;
  }

  useWorkspaceInfo.getActions().setWorkspaceInfo({ path, git });
};
