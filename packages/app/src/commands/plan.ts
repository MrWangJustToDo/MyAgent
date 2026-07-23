import { registerCommand } from "./registry.js";

registerCommand({
  name: "plan",
  description: "Toggle plan mode, execute a ready plan, or show status",
  usage: "/plan [execute|cancel|status]",
  immediate: false,
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const sub = args.trim().toLowerCase();

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
              ? " — send a task, then wait for ## Plan"
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

    if (sub && sub !== "on" && sub !== "off" && sub !== "toggle") {
      return {
        ok: false,
        error: "Usage: /plan | /plan execute | /plan cancel | /plan status",
      };
    }

    if (sub === "on") {
      agent.enablePlanMode();
      return { ok: true, message: "Plan mode on — send a task to explore read-only, then output ## Plan" };
    }
    if (sub === "off") {
      agent.disablePlanMode();
      return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
    }

    const phase = agent.togglePlanMode();
    if (phase === "planning") {
      return { ok: true, message: "Plan mode on — send a task to explore read-only, then output ## Plan" };
    }
    return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
  },
});
