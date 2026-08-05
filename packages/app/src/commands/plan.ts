import { registerCommand } from "./utils/registry.js";

import type { CommandOption } from "./utils/types.js";

registerCommand({
  name: "plan",
  description: "Toggle plan mode, Build/save/load plans, or show status",
  usage: "/plan [execute|cancel|done|status|save [name]|load <name>|list]",
  immediate: false,
  allowCustomInput: true,
  getOptions: async (): Promise<CommandOption[]> => {
    const base: CommandOption[] = [
      { label: "toggle", value: "", description: "Enter or leave plan mode" },
      { label: "execute", value: "execute", description: "Build approved plan (from review)" },
      { label: "done", value: "done", description: "Finish retro and exit plan mode" },
      { label: "cancel", value: "cancel", description: "Pause building → review" },
      { label: "status", value: "status", description: "Show phase and progress" },
      { label: "list", value: "list", description: "List saved plans" },
      { label: "save", value: "save", description: "Save/rename current plan (optional name)" },
    ];

    try {
      const { useAgent } = await import("../hooks/use-agent.js");
      const agent = useAgent.getReadonlyState().agent;
      if (!agent) return base;

      const files = await agent.listWorkspacePlans();
      for (const file of files.slice(0, 15)) {
        const name = file.replace(/\.md$/i, "");
        base.push({
          label: `load ${name}`,
          value: `load ${name}`,
          description: file,
        });
      }
    } catch {
      // ignore list errors in autocomplete
    }

    return base;
  },
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
      const displayPhase =
        state.phase === "ready"
          ? "review"
          : state.phase === "executing"
            ? "building"
            : state.phase === "planning"
              ? "planning"
              : state.phase;
      const progress =
        state.phase === "executing" && stats
          ? ` (${stats.completed}/${stats.total} todos)`
          : state.steps.length > 0
            ? ` (${state.steps.length} steps)`
            : "";
      const path = state.planFilePath ? ` · ${state.planFilePath}` : "";
      const preserved =
        state.preservedExistingTodos && state.phase === "ready"
          ? " — existing todos kept; /plan execute will replace them"
          : "";
      const next =
        state.phase === "ready"
          ? " — run /plan execute to Build"
          : state.phase === "executing"
            ? " — /plan cancel to pause"
            : state.phase === "retro"
              ? " — complete_plan or /plan done"
              : state.phase === "planning"
                ? " — explore with task/read tools, then create_plan (or ## Plan)"
                : "";
      return {
        ok: true,
        message: `Plan mode: ${displayPhase}${progress}${path}${preserved}${next}`,
      };
    }

    if (sub === "done" || sub === "complete") {
      // User force-exit — does not require agent complete_plan verificationResults gate.
      const result = agent.completePlan();
      if (!result.ok) return { ok: false, error: result.error ?? "Cannot complete plan" };
      return { ok: true, message: "Plan complete — plan mode off" };
    }

    if (sub === "cancel") {
      if (!agent.cancelPlanExecution()) {
        return { ok: false, error: "Not building a plan — nothing to cancel" };
      }
      return { ok: true, message: "Building paused — back to review (read-only). Run /plan execute to Build." };
    }

    if (sub === "execute" || sub === "run" || sub === "build") {
      const result = agent.beginPlanExecution();
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Cannot execute plan" };
      }
      const parts = ["Building approved plan…"];
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
        message: `Loaded ${result.path} (${result.stepCount ?? 0} steps) — review. Run /plan execute to Build.`,
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
          "Usage: /plan | /plan execute | /plan done | /plan cancel | /plan status | /plan save [name] | /plan load <name> | /plan list",
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
