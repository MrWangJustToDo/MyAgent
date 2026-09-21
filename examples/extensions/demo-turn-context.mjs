/**
 * Demo: per-turn extension context via `registerContextProvider` + `before_agent_start`.
 *
 * A provider registers ONE per-turn section, emitted each user turn as
 * `<ctx kind=demo-turn-context>` — the tag is the extension id, so enable/disable is
 * expressed symmetrically under the same tag. `disabledContent` is what replaces the
 * section while the extension is disabled at runtime.
 *
 * `before_agent_start` is observe-only: it fires once per user prompt before the
 * turn-context snapshot and its payload carries exactly `prompt` and `sessionId`.
 * There is no `appendSystemPrompt` / `appendTurnContext` field on the event — per-turn
 * model-visible text belongs in the context provider above.
 *
 * Try:
 * - `/ext-turn on` then ask the agent anything — the active_tab line is injected
 * - `/ext-turn off` to stop injecting it
 * - `/ext-turn tab example.com` to set a fake active-tab label
 * - disable this extension from the Ctrl+Y panel and ask again — the disabled notice
 *   replaces the active_tab line under the same <ctx kind=...> tag
 */
export default {
  id: "demo-turn-context",
  name: "Demo Turn Context",
  version: "1.0.0",
  description: "Injects per-turn context via registerContextProvider for prompt-hook testing",
  activate(ctx) {
    let enabled = true;
    let tabLabel = "demo-tab.local";

    // The single unified injection API: one section per extension, per user turn.
    ctx.registerContextProvider({
      content: () => (enabled ? `active_tab: ${tabLabel}` : undefined),
      disabledContent: () => "Turn-context demo is disabled — the active_tab line is not injected.",
    });

    // Observe-only lifecycle hook. `prompt` and `sessionId` are the whole payload.
    ctx.registerInterceptor("before_agent_start", (event) => {
      ctx.logger.info(`[demo-turn-context] before_agent_start prompt length=${event.payload.prompt.length}`);
    });

    ctx.registerCommand({
      name: "ext-turn",
      description: "Extension demo — toggle turn context (on|off|tab <label>)",
      async execute(args) {
        const mode = (args[0] ?? "status").toLowerCase();
        if (mode === "off" || mode === "clear") {
          enabled = false;
          return "turn-context demo disabled";
        }
        if (mode === "on") {
          enabled = true;
          return `turn-context demo enabled (tab=${tabLabel})`;
        }
        if (mode === "tab") {
          const label = args.slice(1).join(" ").trim();
          if (!label) return "usage: /ext-turn tab <label>";
          tabLabel = label;
          enabled = true;
          return `active tab label → ${tabLabel}`;
        }
        return `turn-context demo ${enabled ? "on" : "off"} (tab=${tabLabel})`;
      },
    });

    ctx.logger.info("registered turn-context provider + /ext-turn");
  },
};
