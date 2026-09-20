import { useCallback, useEffect, useMemo, useState } from "react";

import { ExportWorkspaceDialog } from "../components/ExportWorkspaceDialog.js";
import { SettingsDialog } from "../components/SettingsDialog.js";
import { SidePanel } from "../components/SidePanel.js";
import { WorkspacePanel } from "../components/WorkspacePanel.js";
import { useBreakpoint } from "../hooks/use-breakpoint.js";
import { usePlaygroundConfig } from "../hooks/use-playground-config.js";
import { usePreviewPorts } from "../hooks/use-preview-ports.js";
import { useShellState } from "../hooks/use-shell-state.js";
import { useTerminalFit } from "../hooks/use-terminal-fit.js";
import { Sheet } from "../ui/Sheet.js";
import { Toast } from "../ui/State.js";
import { getBootedWebContainer, getWebContainerEnv } from "../webcontainer/create-env.js";
import { resolveFetchProxyUrl, setFetchProxyUrl } from "../webcontainer/create-proxy-fetch.js";
import { subscribePreviewPorts } from "../webcontainer/subscribe-preview-ports.js";

import { AgentSurface } from "./AgentSurface.js";
import { CommandPalette, filterCommands } from "./CommandPalette.js";
import { StatusBar } from "./StatusBar.js";
import { TopBar } from "./TopBar.js";

import type { Command } from "./CommandPalette.js";

/** Mirror WebContainer preview ports into shell state. */
function useSubscribePreviewPorts(fetchProxyUrl: string) {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    void getWebContainerEnv({ fetchProxyUrl }).then(() => {
      if (cancelled) return;
      const wc = getBootedWebContainer();
      if (!wc) return;
      const { upsertOpen, markReady, remove } = usePreviewPorts.getActions();
      unsub = subscribePreviewPorts(wc, {
        onOpen: (port, url) => upsertOpen(port, url),
        onClose: (port) => remove(port),
        onReady: (port, url) => markReady(port, url),
      });
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [fetchProxyUrl]);
}

/**
 * A single stable "close the workspace" callback, so components receiving it
 * (and memoizing around it) are not invalidated on every shell render.
 */
const closeWorkspace = () => usePlaygroundConfig.getActions().setConfig({ workspaceVisible: false });

/**
 * The playground shell.
 *
 * Composition root: one breakpoint owner decides structure (side pane vs sheet),
 * every overlay is mounted here so `Escape` ordering and focus restoration stay
 * predictable, and global shortcuts are registered once.
 *
 * Note the branch structure: `<AgentSurface />` appears at the **same tree
 * position in both branches** (first child of `.workarea`). That is deliberate —
 * React reconciles it in place across a pane ⇄ sheet change, so the running agent
 * is never unmounted just because the window got narrower.
 */
export const AppShell = () => {
  const breakpoint = useBreakpoint();
  const fit = useTerminalFit();

  const fetchProxyUrl = usePlaygroundConfig((s) => s.fetchProxyUrl);
  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const { setConfig } = usePlaygroundConfig.getActions();

  const boot = useShellState((s) => s.boot);
  const settingsOpen = useShellState((s) => s.settingsOpen);
  const exportOpen = useShellState((s) => s.exportOpen);
  const paletteOpen = useShellState((s) => s.paletteOpen);
  const toast = useShellState((s) => s.toast);
  const previewUrl = useShellState((s) => s.previewUrl);
  const restart = useShellState((s) => s.agentRestart);
  const { clearToast, setWorkspaceTab, setPaletteOpen, setExportOpen, setSettingsOpen, bumpPreviewNonce } =
    useShellState.getActions();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  setFetchProxyUrl(resolveFetchProxyUrl(fetchProxyUrl));
  useSubscribePreviewPorts(fetchProxyUrl);

  // Open the workspace once the agent is ready (first boot only).
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || boot.phase !== "ready") return;
    setConfig({ workspaceVisible: true });
    setAutoOpened(true);
  }, [autoOpened, boot.phase, setConfig]);

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  const commands = useMemo<Command[]>(() => {
    const hasContainer = Boolean(getBootedWebContainer());
    const list: Command[] = [
      {
        id: "workspace.toggle",
        title: workspaceVisible ? "Hide workspace panel" : "Show workspace panel",
        group: "Workspace",
        shortcut: "⌘B",
        run: () => setConfig({ workspaceVisible: !workspaceVisible }),
      },
      {
        id: "workspace.code",
        title: "Go to Code tab",
        group: "Workspace",
        run: () => {
          setConfig({ workspaceVisible: true });
          setWorkspaceTab("code");
        },
      },
      {
        id: "workspace.preview",
        title: "Go to Preview tab",
        group: "Workspace",
        run: () => {
          setConfig({ workspaceVisible: true });
          setWorkspaceTab("preview");
        },
      },
      {
        id: "workspace.variants",
        title: "Go to Variants tab",
        group: "Workspace",
        run: () => {
          setConfig({ workspaceVisible: true });
          setWorkspaceTab("variants");
        },
      },
      {
        id: "settings.open",
        title: "Open settings",
        group: "Application",
        shortcut: "⌘,",
        run: () => setSettingsOpen(true),
      },
      {
        id: "agent.restart",
        title: "Restart agent",
        group: "Application",
        keywords: "reload reconnect bootstrap",
        run: () => restart?.(),
      },
      {
        id: "shell.reload",
        title: "Reload playground",
        group: "Application",
        keywords: "refresh browser reset",
        run: () => window.location.reload(),
      },
    ];

    if (hasContainer) {
      list.push(
        {
          id: "export.open",
          title: "Export workspace as ZIP",
          group: "Workspace",
          keywords: "download save",
          run: () => setExportOpen(true),
        },
        {
          id: "preview.refresh",
          title: "Reload preview",
          group: "Preview",
          run: () => {
            setConfig({ workspaceVisible: true });
            setWorkspaceTab("preview");
            bumpPreviewNonce();
          },
        }
      );
      if (previewUrl) {
        list.push(
          {
            id: "preview.open",
            title: "Open preview in a new tab",
            group: "Preview",
            run: () => window.open(previewUrl, "_blank", "noopener,noreferrer"),
          },
          {
            id: "preview.copy",
            title: "Copy preview URL",
            group: "Preview",
            run: () => void navigator.clipboard.writeText(previewUrl).catch(() => {}),
          }
        );
      }
    }

    return list;
  }, [
    workspaceVisible,
    previewUrl,
    restart,
    setConfig,
    setSettingsOpen,
    setExportOpen,
    setWorkspaceTab,
    bumpPreviewNonce,
  ]);

  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filteredCommands.length - 1)));
  }, [filteredCommands.length]);

  const runCommand = useCallback(
    (command: Command) => {
      setPaletteOpen(false);
      command.run();
    },
    [setPaletteOpen]
  );

  const paletteCommands = useMemo(
    () => filteredCommands.map((c) => ({ ...c, run: () => runCommand(c) })),
    [filteredCommands, runCommand]
  );

  // Reset the query whenever the palette opens.
  useEffect(() => {
    if (!paletteOpen) return;
    setQuery("");
    setActiveIndex(0);
  }, [paletteOpen]);

  // ---------------------------------------------------------------------------
  // Global shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (key === "b") {
        event.preventDefault();
        setConfig({ workspaceVisible: !workspaceVisible });
      } else if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setConfig, setSettingsOpen, setPaletteOpen, workspaceVisible]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => clearToast(), 2800);
    return () => window.clearTimeout(id);
  }, [toast, clearToast]);

  const panel = <WorkspacePanel asSheet={breakpoint.panelAsSheet} onClose={closeWorkspace} />;

  return (
    <div className="shell" data-breakpoint={breakpoint.name}>
      <TopBar breakpoint={breakpoint} boot={boot} />

      <main className="workarea">
        {/* First child in every mode: toggling the panel or switching between pane
            and sheet never moves the terminal in the tree, so the running agent is
            reconciled in place instead of being unmounted. */}
        <div className="workarea__main">
          <AgentSurface />
        </div>

        {breakpoint.panelAsSheet
          ? workspaceVisible && (
              <Sheet open onClose={closeWorkspace} title="Workspace" side="bottom">
                {panel}
              </Sheet>
            )
          : workspaceVisible && <SidePanel>{panel}</SidePanel>}
      </main>

      <StatusBar breakpoint={breakpoint} fit={fit} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        query={query}
        onQueryChange={setQuery}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
      />
      <SettingsDialog open={settingsOpen} />
      {exportOpen && <ExportWorkspaceDialog onClose={() => setExportOpen(false)} />}
      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
};
