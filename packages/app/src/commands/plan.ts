import { registerCommand } from "./registry.js";

registerCommand({
  name: "plan",
  description: "Toggle plan mode, execute/save/load plans, or show status",
  usage: "/plan [execute|cancel|status|save [name]|load <name>|list]",
  immediate: false,
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const trimmed = args.trim();
    const [subRaw = "", ...rest] = trimmed.split(/\s+/);
    const sub = subRaw.toLowerCase();
    const nameArg = rest.join(" ").trim();

    if (sub === "status") {
      const state = agent.getPlanModeState();
      const stats = agent.todoManager?.getStats();
      const progress =
        state.phase === "executing" && stats
          ? ` (${stats.completed}/${stats.total} todos)`
          : state.steps.length > 0
            ? ` (${state.steps.length} steps)`
            : "";
      const preserved =
        state.preservedExistingTodos && state.phase === "ready"
          ? " — existing todos kept; /plan execute will replace them"
          : "";
      const next =
        state.phase === "ready"
          ? " — run /plan execute to start"
          : state.phase === "executing"
            ? " — /plan cancel to pause"
            : state.phase === "planning"
              ? " — explore with task/read tools, then create_plan (or ## Plan)"
              : "";
      return {
        ok: true,
        message: `Plan mode: ${state.phase}${progress}${preserved}${next}`,
      };
    }

    if (sub === "cancel") {
      if (!agent.cancelPlanExecution()) {
        return { ok: false, error: "Not executing a plan — nothing to cancel" };
      }
      return { ok: true, message: "Plan execution paused — still ready (read-only). Run /plan execute to resume." };
    }

    if (sub === "execute" || sub === "run") {
      const result = agent.beginPlanExecution();
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Cannot execute plan" };
      }
      const parts = ["Executing approved plan…"];
      if (result.queued) {
        parts.push("(queued — starts after the current run finishes)");
      }
      if (result.replacedExistingTodos) {
        parts.push("(replaced existing todos with plan steps)");
      }
      return { ok: true, message: parts.join(" ") };
    }

    if (sub === "save") {
      const result = await agent.savePlanToWorkspace(nameArg || undefined);
      if (!result.ok) return { ok: false, error: result.error ?? "Save failed" };
      return { ok: true, message: `Plan saved to ${result.path}` };
    }

    if (sub === "load") {
      if (!nameArg) {
        return { ok: false, error: "Usage: /plan load <name>" };
      }
      const result = await agent.loadPlanFromWorkspace(nameArg);
      if (!result.ok) return { ok: false, error: result.error ?? "Load failed" };
      return {
        ok: true,
        message: `Loaded ${result.path} (${result.stepCount ?? 0} steps) — ready. Run /plan execute to build.`,
      };
    }

    if (sub === "list") {
      const files = await agent.listWorkspacePlans();
      if (files.length === 0) {
        return { ok: true, message: "No saved plans in .agents/plans/" };
      }
      return { ok: true, message: `Saved plans:\n${files.map((f) => `- ${f}`).join("\n")}` };
    }

    if (sub && sub !== "on" && sub !== "off" && sub !== "toggle") {
      return {
        ok: false,
        error:
          "Usage: /plan | /plan execute | /plan cancel | /plan status | /plan save [name] | /plan load <name> | /plan list",
      };
    }

    if (sub === "on") {
      agent.enablePlanMode();
      return {
        ok: true,
        message: "Plan mode on — explore read-only (prefer task), then create_plan when ready",
      };
    }
    if (sub === "off") {
      agent.disablePlanMode();
      return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
    }

    const phase = agent.togglePlanMode();
    if (phase === "planning") {
      return {
        ok: true,
        message: "Plan mode on — explore read-only (prefer task), then create_plan when ready",
      };
    }
    return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
  },
});
