import { parseModelsConfig } from "@codent/core";
import { toRaw } from "reactivity-store";

import { ConfigEditor } from "../components/ConfigEditor.js";
import { ExtensionPanel } from "../components/ExtensionPanel.js";
import { FullBox } from "../components/FullBox.js";
import { MessageViewWithCompact } from "../components/MessageListWithCompact.js";
import { PlanReadyBanner } from "../components/PlanReadyBanner.js";
import { SessionResumePicker } from "../components/SessionResumePicker.js";
import { SubagentPanel } from "../components/SubagentPanel.js";
import { WorkspacePanel } from "../components/WorkspacePanel.js";
import { useAdapter } from "../context/adapter-context.js";
import { useAgentChat } from "../hooks/use-agent-chat.js";
import { useAgentInputControls } from "../hooks/use-agent-input-controls.js";
import { useAgent } from "../hooks/use-agent.js";
import { useCommandOutput } from "../hooks/use-command-output.js";
import { useConfigEditor } from "../hooks/use-config-editor.js";
import { useConfig } from "../hooks/use-config.js";
import { useExtensionPanel } from "../hooks/use-extension-panel.js";
import { useExtensionUIBridge } from "../hooks/use-extension-ui.js";
import { useFlattenCacheCleanup } from "../hooks/use-flatten-cache-cleanup.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { useSubagentPanel } from "../hooks/use-subagent-panel.js";
import { useWorkspaceView } from "../hooks/use-workspace-view.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";
import { WelcomePanel } from "../layout/WelcomePanel.js";
import { applyModelsConfigEdit } from "../utils/apply-models-config-edit.js";

import type { AppConfig } from "../adapter/types.js";
import type { LoadedModelsState, ModelsConfig, ModelsConfigEntry } from "@codent/core";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const adapter = useAdapter();

  useSize.getActions().useInitTerminalSize();

  const screenWidth = useSize((s) => s.state.screenWidth);

  useStatic.getActions().useInitStdout();

  // Root-level so it outlives the subagent panel: a destroyed agent's full-transcript
  // flatten snapshot is released even if the user already navigated away from its panel.
  useFlattenCacheCleanup();

  // The config store wraps state as DeepReadonly; downstream consumers
  // (useAgentChat → adapter.initialize → createAgentFromConfig) treat it as a
  // mutable AppConfig. The store is the single owner, so a cast is safe here.
  const config = useConfig((s) => s.config) as AppConfig;

  const {
    messages,
    sendMessage,
    steer,
    followUp,
    forceSubmit,
    queuedMessages,
    isLoading,
    isReady,
    status,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    setClientToolWaiting,
    initError,
    initLoading,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
    saveSessionFromChat,
    saveError,
  } = useAgentChat(config);

  const subagentPanelView = useSubagentPanel((s) => s.view);
  const subagentPanelOpen = subagentPanelView !== "closed";
  const workspaceView = useWorkspaceView((s) => s.view);
  const workspaceOpen = workspaceView === "workspace";
  const extensionPanelView = useExtensionPanel((s) => s.view);
  const extensionPanelOpen = extensionPanelView !== "closed";
  const configEditorOpen = useConfigEditor((s) => s.view === "open");

  useExtensionUIBridge();

  const activeSession = useAgent((s) => s.session);
  const showResumePicker = config.resumeSession === "__picker__";

  useAgentInputControls({
    adapter,
    initialPrompt: config.initialPrompt,
    isReady,
    isLoading,
    initLoading,
    messages,
    sendMessage,
    steer,
    followUp,
    forceSubmit,
    queuedMessages,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    setClientToolWaiting,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
    saveSessionFromChat,
  });

  // ============================================================================
  // Render
  // ============================================================================

  if (initError) {
    return <WelcomePanel variant="error" screenWidth={screenWidth} errorMessage={initError.message} />;
  }

  if (initLoading) {
    return <WelcomePanel variant="loading" screenWidth={screenWidth} loadingText="Initializing sandbox…" />;
  }

  if (showResumePicker && activeSession) {
    return <SessionResumePicker session={activeSession} setMessages={setMessages} />;
  }

  // `/settings config` — the model-config wizard, over the running app. It is a
  // full-screen swap like the panels below, and `isAnyPanelOpen()` keeps every
  // central keybinding off the keyboard while it is up (the editor owns input).
  if (configEditorOpen) {
    return <ConfigEditorOverlay />;
  }

  return (
    <FullBox flexDirection="column">
      <Header />
      {workspaceOpen ? (
        <WorkspacePanel />
      ) : subagentPanelOpen ? (
        <SubagentPanel />
      ) : extensionPanelOpen ? (
        <ExtensionPanel />
      ) : (
        <>
          <MessageViewWithCompact messages={messages} />
          <Content />
          <PlanReadyBanner />
          <Footer status={status} queuedMessages={queuedMessages} saveError={saveError} />
        </>
      )}
    </FullBox>
  );
};

// ============================================================================
// Mid-session model config editor
// ============================================================================

/**
 * The model-config wizard, opened over the running app by `/settings config`.
 *
 * Seeded from the entry the session is actually running on (`modelsConfig.active`)
 * so the form opens on the live connection, and saved through
 * {@link applyModelsConfigEdit}, which merges the draft into the existing file
 * (other entries and `global` survive) and reloads the pipeline in place — no
 * restart, no session teardown.
 */
const ConfigEditorOverlay = () => {
  const close = useConfigEditor.getActions().close;
  const showOutput = useCommandOutput.getActions().show;

  // The wizard's draft is seeded once, at mount, and the overlay is unmounted on
  // close (Agent returns early), so the seeded entry can be read directly.
  const entry = useConfigEditor((s) => {
    void s.view;
    return selectEditedEntry().entry;
  });

  const handleDone = (config: ModelsConfig): void => {
    close();
    const { entryIndex } = selectEditedEntry();
    void applyModelsConfigEdit(config, { entryIndex }).then((result) => {
      if (!result.ok) {
        showOutput("/settings config", `Config not saved: ${result.error}`);
        return;
      }
      showOutput(
        "/settings config",
        [
          `Saved .agents/config/models.json (entry ${entryIndex}: ${describeEditedEntry(result.loaded, entryIndex)})`,
          result.reloadError
            ? `Not live yet — reloading failed: ${result.reloadError}\nRestart to apply it.`
            : result.model
              ? `Live model: ${result.model} — run /models to re-pick if the new list dropped it.`
              : "No model id in the entry — add one to select a model.",
        ].join("\n")
      );
    });
  };

  return (
    <ConfigEditor
      mode="edit"
      initialEntry={entry}
      onCancel={close}
      onDone={handleDone}
      parseModelsConfig={parseModelsConfig}
      saveModelsConfig={async (config) => {
        // The write is owned by `applyModelsConfigEdit` (it merges the draft into
        // the existing file first), so the editor's own save is a no-op that just
        // resolves — the merge needs the draft, not the raw write.
        void config;
      }}
    />
  );
};

/**
 * The models.json entry the wizard re-edits: the active one (or none).
 *
 * Unwrapped with `toRaw` (the store hands out readonly proxies) and deep-cloned,
 * because the editor seeds React state from it. A `remote-provider` entry has no
 * connection fields — the editor falls back to a blank draft for it.
 */
function selectEditedEntry(): { entry: ModelsConfigEntry | undefined; entryIndex: number } {
  const loaded = toRaw(useConfig.getReadonlyState().modelsConfig) as LoadedModelsState | null;
  const entryIndex = loaded?.active.entryIndex ?? 0;
  const raw = loaded?.config.models[entryIndex] as ModelsConfigEntry | undefined;
  const entry = raw ? (JSON.parse(JSON.stringify(raw)) as ModelsConfigEntry) : undefined;
  return { entry, entryIndex };
}

function describeEditedEntry(loaded: LoadedModelsState | null, index: number): string {
  const entry = loaded?.entries[index];
  if (!entry) return "unknown";
  if (entry.type === "session") return "session-server";
  if (entry.type === "remote") return "remote-provider";
  return `direct:${entry.style}@${entry.baseURL.replace(/\/+$/, "")}`;
}
