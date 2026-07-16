import type { Unsubscribe, WebContainer } from "@webcontainer/api";

export type PreviewPortListener = {
  onOpen: (port: number, url: string) => void;
  onClose: (port: number) => void;
  onReady: (port: number, url: string) => void;
};

/**
 * Subscribe to WebContainer port / server-ready events for the host preview panel.
 * Returns an unsubscribe that tears down both listeners.
 */
export function subscribePreviewPorts(wc: WebContainer, listener: PreviewPortListener): Unsubscribe {
  const unsubPort = wc.on("port", (port, type, url) => {
    if (type === "open") {
      listener.onOpen(port, url);
    } else {
      listener.onClose(port);
    }
  });

  const unsubReady = wc.on("server-ready", (port, url) => {
    listener.onReady(port, url);
  });

  return () => {
    unsubPort();
    unsubReady();
  };
}
