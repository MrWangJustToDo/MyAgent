import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "auto",
  description: "Toggle auto mode — skip all tool approvals (YOLO)",
  usage: "/auto [on|off|status]",
  immediate: true,
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const sub = args.trim().toLowerCase();
    if (sub === "status" || sub === "") {
      if (sub === "status") {
        return {
          ok: true,
          message: agent.isAutoApproveEnabled()
            ? "Auto mode on — tools run without approval"
            : "Auto mode off — tools require approval when configured",
        };
      }
      const enabled = agent.toggleAutoApprove();
      return {
        ok: true,
        message: enabled
          ? "Auto mode on — tools run without approval"
          : "Auto mode off — tools require approval when configured",
      };
    }

    if (sub === "on" || sub === "enable") {
      agent.setAutoApproveEnabled(true);
      return { ok: true, message: "Auto mode on — tools run without approval" };
    }

    if (sub === "off" || sub === "disable") {
      agent.setAutoApproveEnabled(false);
      return { ok: true, message: "Auto mode off — tools require approval when configured" };
    }

    return { ok: false, error: "Usage: /auto | /auto on | /auto off | /auto status" };
  },
});
