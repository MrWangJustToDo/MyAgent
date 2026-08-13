import { useEffect, useMemo, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";
import { useSubagentPanel } from "../hooks/use-subagent-panel.js";

import { SubagentDetailPanel } from "./SubagentDetailPanel.js";
import { SubagentListPanel } from "./SubagentListPanel.js";

/** Full-screen overlay for inspecting active subagent tasks. */
export const SubagentPanel = () => {
  const [ready, setReady] = useState(false);
  const view = useSubagentPanel((s) => s.view);
  const selectedSubagentId = useSubagentPanel((s) => s.selectedSubagentId);
  const { openDetail, close, backToList } = useSubagentPanel.getActions();
  const rootSession = toRaw(useAgent((s) => s.session));
  const [listRevision, setListRevision] = useState(0);

  useEffect(() => {
    if (typeof process === "object") {
      import("ansi-escapes").then((pkg) => {
        process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0));
      });
    }

    setReady(true);
    if (view === "closed") return;
    if (!rootSession) return;

    // Row-level status is handled by SubagentTaskRow (per-child session
    // subscription). The root only needs to re-read the task list when its
    // membership changes (a subagent is created or destroyed).
    return rootSession.subscribe(
      (event) => {
        if (event.channel !== "lifecycle") return;
        const type = event.payload.type;
        if (type === "subagent:created" || type === "subagent:destroyed") {
          setListRevision((n) => n + 1);
        }
      },
      { channels: ["lifecycle"] }
    );
  }, [view, rootSession]);

  const allTasks = useMemo(() => {
    void listRevision;
    return rootSession?.getSnapshot().subagents ?? [];
  }, [rootSession, listRevision]);

  if (view === "closed") return null;

  if (!ready) return null;

  if (view === "detail" && selectedSubagentId) {
    return <SubagentDetailPanel subagentId={selectedSubagentId} onBack={backToList} />;
  }

  return <SubagentListPanel tasks={allTasks} onSelect={openDetail} onClose={close} />;
};
