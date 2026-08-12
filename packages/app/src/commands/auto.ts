import { useAgent } from "../hooks/use-agent.js";
import { isPendingToolApproval, isToolCallPart } from "../utils/tool-part.js";

import { registerCommand } from "./utils/registry.js";

import type { AgentMode } from "@my-agent/core";

registerCommand({
  name: "auto",
  description: "Toggle auto mode — skip all tool approvals (YOLO)",
  usage: "/auto [on|off|status]",
  getOptions: () => {
    const snap = useAgent.getReadonlyState().session?.getSnapshot();
    const mode: AgentMode = snap?.mode ?? "normal";
    const current = snap?.autoMode ? "on" : "off";
    return [
      {
        label: "toggle",
        value: "",
        description: `Toggle auto mode (currently: ${current})`,
        defaultSelected: mode === "normal",
      },
      {
        label: "on",
        value: "on",
        description: "Enable auto approve",
      },
      {
        label: "off",
        value: "off",
        description: "Disable auto approve",
        defaultSelected: mode === "auto" || mode === "plan",
      },
      { label: "status", value: "status", description: "Show current status" },
    ];
  },
  execute: async (args, ctx) => {
    const session = ctx.getSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    const sub = args.trim().toLowerCase();

    const approveAllPending = async () => {
      if (!ctx.addToolApprovalResponse || !ctx.getMessages) return;
      const messages = ctx.getMessages();
      for (const msg of messages) {
        if (msg.role !== "assistant") continue;
        for (const part of msg.parts) {
          if (!isToolCallPart(part)) continue;
          if (!isPendingToolApproval(part)) continue;
          const approvalId = part.approval?.id;
          if (!approvalId) continue;
          await ctx.addToolApprovalResponse({ id: approvalId, approved: true });
        }
      }
    };

    if (sub === "status") {
      const enabled = session.getSnapshot().autoMode;
      return {
        ok: true,
        message: enabled
          ? "Auto mode on — tools run without approval"
          : "Auto mode off — tools require approval when configured",
      };
    }

    if (sub === "" || sub === "toggle") {
      const wasEnabled = session.getSnapshot().autoMode;
      const result = await session.dispatch({ type: "auto.toggle" });
      if (!result.ok) return { ok: false, error: result.error };
      const enabled = Boolean((result.data as { enabled?: boolean } | undefined)?.enabled);
      if (enabled && !wasEnabled) {
        await approveAllPending();
      }
      return {
        ok: true,
        message: enabled
          ? "Auto mode on — tools run without approval"
          : "Auto mode off — tools require approval when configured",
      };
    }

    if (sub === "on" || sub === "enable") {
      await session.dispatch({ type: "auto.set", enabled: true });
      await approveAllPending();
      return { ok: true, message: "Auto mode on — tools run without approval" };
    }

    if (sub === "off" || sub === "disable") {
      await session.dispatch({ type: "auto.set", enabled: false });
      return { ok: true, message: "Auto mode off — tools require approval when configured" };
    }

    return { ok: false, error: "Usage: /auto | /auto on | /auto off | /auto status" };
  },
});
