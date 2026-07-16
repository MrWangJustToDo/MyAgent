import { useEffect, useState } from "react";

import { useWorkspaceView } from "../hooks/use-workspace-view.js";

import { WorkspaceFileMode } from "./WorkspaceFileMode.js";

export const WorkspacePanel = () => {
  const [ready, setReady] = useState(false);

  const view = useWorkspaceView((s) => s.view);

  useEffect(() => {
    if (view !== "workspace") return;
    if (typeof process === "object") {
      import("ansi-escapes").then((pkg) => {
        process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0));
      });
    }
    setReady(true);
  }, [view]);

  if (view !== "workspace") return null;

  if (!ready) return null;

  return <WorkspaceFileMode />;
};
