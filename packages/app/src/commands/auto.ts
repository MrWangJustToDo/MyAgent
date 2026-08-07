import { useAgent } from "../hooks/use-agent.js";
import { isPendingToolApproval, isToolCallPart } from "../utils/tool-part.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "auto",
  description: "Toggle auto mode — skip all tool approvals (YOLO)",
  usage: "/auto [on|off|status]",
  getOptions: () => {
    const agent = useAgent.getReadonlyState().agent;
    const current = agent?.isAutoApproveEnabled() ? "on" : "off";
    return [
      {
        label: "toggle",
        value: "",
        description: `Toggle auto mode (currently: ${current})`,
      },
      { label: "on", value: "on", description: "Enable auto approve" },
      { label: "off", value: "off", description: "Disable auto approve" },
      { label: "status", value: "status", description: "Show current status" },
    ];
  },
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const sub = args.trim().toLowerCase();

    // Approve all pending tool approvals when enabling auto mode
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
      return {
        ok: true,
        message: agent.isAutoApproveEnabled()
          ? "Auto mode on — tools run without approval"
          : "Auto mode off — tools require approval when configured",
      };
    }

    if (sub === "" || sub === "toggle") {
      const wasEnabled = agent.isAutoApproveEnabled();
      const enabled = agent.toggleAutoApprove();
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
      agent.setAutoApproveEnabled(true);
      await approveAllPending();
      return { ok: true, message: "Auto mode on — tools run without approval" };
    }

    if (sub === "off" || sub === "disable") {
      agent.setAutoApproveEnabled(false);
      return { ok: true, message: "Auto mode off — tools require approval when configured" };
    }

    return { ok: false, error: "Usage: /auto | /auto on | /auto off | /auto status" };
  },
});
