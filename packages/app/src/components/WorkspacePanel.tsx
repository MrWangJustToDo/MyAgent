import { useWorkspaceView } from "../hooks/use-workspace-view.js";

import { PanelOverlay } from "./PanelOverlay.js";
import { WorkspaceFileMode } from "./WorkspaceFileMode.js";

export const WorkspacePanel = () => {
  const view = useWorkspaceView((s) => s.view);

  return (
    <PanelOverlay open={view === "workspace"}>
      <WorkspaceFileMode />
    </PanelOverlay>
  );
};
