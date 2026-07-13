import { useEffect } from "@my-react/react";

import { useWorkspaceView } from "../hooks/use-workspace-view.js";

import { WorkspaceFileMode } from "./WorkspaceFileMode.js";

export const WorkspacePanel = () => {
  const view = useWorkspaceView((s) => s.view);

  useEffect(() => {
    if (view !== "workspace") return;
    if (typeof process === "object") {
      import("ansi-escapes").then((pkg) => {
        process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0));
      });
    }
  }, [view]);

  if (view !== "workspace") return null;

  return <WorkspaceFileMode />;
};
