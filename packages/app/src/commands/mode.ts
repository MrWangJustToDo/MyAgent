import { useAgent } from "../hooks/use-agent.js";
import { isPendingToolApproval, isToolCallPart } from "../utils/tool-part.js";

import { registerCommand } from "./utils/registry.js";

import type { CommandOption } from "./utils/types.js";

function getModeOptions(): CommandOption[] {
  const a = useAgent.getReadonlyState().agent;
  const mode = a?.getAgentMode?.() ?? "normal";
  const planState = a?.getPlanModeState?.();

  const options: CommandOption[] = [];

  // ── Auto mode ──
  options.push({
    label: "auto on",
    value: "auto on",
    description: "Enable auto mode — skip all tool approvals",
    defaultSelected: mode === "normal",
  });
  options.push({
    label: "auto off",
    value: "auto off",
    description: "Disable auto mode",
    defaultSelected: mode === "auto" || mode === "plan",
  });

  // ── Plan mode toggle ──
  const planPhase = planState?.phase ?? "off";
  options.push({
    label: "plan on",
    value: "plan on",
    description: "Enter plan mode (read-only, then create_plan)",
  });
  options.push({
    label: "plan off",
    value: "plan off",
    description: "Exit plan mode",
  });

  // ── Plan actions (only relevant when plan is active) ──
  if (planPhase === "ready") {
    options.push({
      label: "plan execute",
      value: "plan execute",
      description: "Build approved plan (from review)",
    });
  }
  if (planPhase === "executing") {
    options.push({
      label: "plan cancel",
      value: "plan cancel",
      description: "Pause building → review",
    });
  }
  if (planPhase === "retro") {
    options.push({
      label: "plan done",
      value: "plan done",
      description: "Finish retro and exit plan mode",
    });
  }
  options.push({
    label: "plan status",
    value: "plan status",
    description: "Show plan phase and progress",
  });
  options.push({
    label: "plan list",
    value: "plan list",
    description: "List saved plans",
  });
  options.push({
    label: "plan save",
    value: "plan save",
    description: "Save/rename current plan (optional name)",
    freeform: true,
  });
  return options;
}

registerCommand({
  name: "mode",
  description: "Switch auto/plan mode, or manage plans",
  usage: "/mode [auto on|off|plan on|off|execute|done|cancel|status|save|load|list]",
  allowCustomInput: true,
  getOptions: async (): Promise<CommandOption[]> => {
    const options = getModeOptions();

    // Append saved plan names for quick load
    const agent = useAgent.getReadonlyState().agent;
    if (agent) {
      try {
        const files = await agent.listWorkspacePlans();
        for (const file of files.slice(0, 10)) {
          const name = file.replace(/\.md$/i, "");
          options.push({
            label: `plan load ${name}`,
            value: `plan load ${name}`,
            description: file,
          });
        }
      } catch {
        // ignore list errors
      }
    }

    return options;
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

    // ── Auto mode sub-commands ──
    if (sub === "auto") {
      const autoSub = rest[0]?.toLowerCase() ?? "";

      if (autoSub === "on" || autoSub === "enable") {
        agent.setAutoModeEnabled(true);
        // Approve all pending tool approvals when enabling auto mode
        if (ctx.addToolApprovalResponse && ctx.getMessages) {
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
        }
        return { ok: true, message: "Auto mode on — tools run without approval" };
      }

      if (autoSub === "off" || autoSub === "disable") {
        agent.setAutoModeEnabled(false);
        return { ok: true, message: "Auto mode off — tools require approval when configured" };
      }

      // toggle
      const wasEnabled = agent.isAutoModeEnabled();
      const enabled = agent.toggleAutoMode();
      if (enabled && !wasEnabled && ctx.addToolApprovalResponse && ctx.getMessages) {
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
      }
      return {
        ok: true,
        message: enabled
          ? "Auto mode on — tools run without approval"
          : "Auto mode off — tools require approval when configured",
      };
    }

    // ── Plan mode sub-commands ──
    if (sub === "plan") {
      const planSub = rest[0]?.toLowerCase() ?? "";

      if (planSub === "status") {
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
            ? " — existing todos kept; /mode plan execute will replace them"
            : "";
        const next =
          state.phase === "ready"
            ? " — run /mode plan execute to Build"
            : state.phase === "executing"
              ? " — /mode plan cancel to pause"
              : state.phase === "retro"
                ? " — complete_plan or /mode plan done"
                : state.phase === "planning"
                  ? " — explore with task/read tools, then create_plan (or ## Plan)"
                  : "";
        return {
          ok: true,
          message: `Plan mode: ${displayPhase}${progress}${path}${preserved}${next}`,
        };
      }

      if (planSub === "done" || planSub === "complete") {
        const result = agent.completePlan();
        if (!result.ok) return { ok: false, error: result.error ?? "Cannot complete plan" };
        return { ok: true, message: "Plan complete — plan mode off" };
      }

      if (planSub === "cancel") {
        if (!agent.cancelPlanExecution()) {
          return { ok: false, error: "Not building a plan — nothing to cancel" };
        }
        return { ok: true, message: "Building paused — back to review (read-only). Run /mode plan execute to Build." };
      }

      if (planSub === "execute" || planSub === "run" || planSub === "build") {
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

      if (planSub === "save") {
        const saveName = rest.slice(1).join(" ").trim() || undefined;
        const result = await agent.savePlanToWorkspace(saveName);
        if (!result.ok) return { ok: false, error: result.error ?? "Save failed" };
        return { ok: true, message: `Plan saved to ${result.path}` };
      }

      if (planSub === "load") {
        const loadName = rest.slice(1).join(" ").trim();
        if (!loadName) {
          return { ok: false, error: "Usage: /mode plan load <name>" };
        }
        const result = await agent.loadPlanFromWorkspace(loadName);
        if (!result.ok) return { ok: false, error: result.error ?? "Load failed" };
        return {
          ok: true,
          message: `Loaded ${result.path} (${result.stepCount ?? 0} steps) — review. Run /mode plan execute to Build.`,
        };
      }

      if (planSub === "list") {
        const files = await agent.listWorkspacePlans();
        if (files.length === 0) {
          return { ok: true, message: "No saved plans in .agents/plans/" };
        }
        return { ok: true, message: `Saved plans:\n${files.map((f) => `- ${f}`).join("\n")}` };
      }

      if (planSub === "on") {
        agent.enablePlanMode();
        return {
          ok: true,
          message: "Plan mode on — explore read-only (prefer task), then create_plan when ready",
        };
      }
      if (planSub === "off") {
        agent.disablePlanMode();
        return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
      }

      // toggle
      const phase = agent.togglePlanMode();
      if (phase === "planning") {
        return {
          ok: true,
          message: "Plan mode on — explore read-only (prefer task), then create_plan when ready",
        };
      }
      return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
    }

    // ── No sub-command or unknown ──
    if (!trimmed) {
      // Toggle based on current mode: auto when normal/plan, plan off when plan
      const currentMode = agent.getAgentMode();
      if (currentMode === "plan") {
        agent.disablePlanMode();
        return { ok: true, message: "Plan mode off (plan todos cleared if any)" };
      }
      if (currentMode === "auto") {
        agent.setAutoModeEnabled(false);
        return { ok: true, message: "Auto mode off — tools require approval when configured" };
      }
      // Normal → toggle auto on
      agent.setAutoModeEnabled(true);
      if (ctx.addToolApprovalResponse && ctx.getMessages) {
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
      }
      return { ok: true, message: "Auto mode on — tools run without approval" };
    }

    return {
      ok: false,
      error: "Usage: /mode [auto on|off|plan on|off|execute|done|cancel|status|save [name]|load <name>|list]",
    };
  },
});
