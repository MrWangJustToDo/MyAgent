import { createState } from "reactivity-store";

export interface PreviewPortEntry {
  port: number;
  url: string;
  ready: boolean;
}

/** Pure helpers — kept testable without the store. */

export function upsertPortOpen(ports: PreviewPortEntry[], port: number, url: string): PreviewPortEntry[] {
  const idx = ports.findIndex((p) => p.port === port);
  if (idx === -1) {
    return [...ports, { port, url, ready: false }].sort((a, b) => a.port - b.port);
  }
  const next = ports.slice();
  next[idx] = { ...next[idx]!, url, ready: next[idx]!.ready };
  return next;
}

export function markPortReady(ports: PreviewPortEntry[], port: number, url: string): PreviewPortEntry[] {
  const idx = ports.findIndex((p) => p.port === port);
  if (idx === -1) {
    return [...ports, { port, url, ready: true }].sort((a, b) => a.port - b.port);
  }
  const next = ports.slice();
  next[idx] = { ...next[idx]!, url, ready: true };
  return next;
}

export function removePort(
  ports: PreviewPortEntry[],
  port: number
): { ports: PreviewPortEntry[]; nextActive: number | null } {
  const next = ports.filter((p) => p.port !== port);
  return {
    ports: next,
    nextActive: next[0]?.port ?? null,
  };
}

export const usePreviewPorts = createState(
  () => ({
    ports: [] as PreviewPortEntry[],
    activePort: null as number | null,
    panelOpen: false,
    autoOpened: false,
  }),
  {
    withActions: (state) => ({
      upsertOpen: (port: number, url: string) => {
        const wasEmpty = state.ports.length === 0;
        state.ports = upsertPortOpen(state.ports, port, url);
        if (state.activePort === null) {
          state.activePort = port;
        }
        if (wasEmpty && !state.autoOpened) {
          state.panelOpen = true;
          state.autoOpened = true;
        }
      },
      markReady: (port: number, url: string) => {
        const wasEmpty = state.ports.length === 0;
        state.ports = markPortReady(state.ports, port, url);
        if (state.activePort === null) {
          state.activePort = port;
        }
        if ((wasEmpty || !state.autoOpened) && !state.panelOpen) {
          state.panelOpen = true;
          state.autoOpened = true;
        }
      },
      remove: (port: number) => {
        const { ports, nextActive } = removePort(state.ports, port);
        state.ports = ports;
        if (state.activePort === port) {
          state.activePort = nextActive;
        }
        if (ports.length === 0) {
          state.panelOpen = false;
          state.activePort = null;
        }
      },
      setActive: (port: number) => {
        if (state.ports.some((p) => p.port === port)) {
          state.activePort = port;
        }
      },
      setPanelOpen: (open: boolean) => {
        state.panelOpen = open;
      },
    }),
  }
);
