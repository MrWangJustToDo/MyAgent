/**
 * use-streaming-output — React hook for subscribing to real-time tool output.
 *
 * Uses reactivity-store for automatic UI updates.
 */

import { setStreamingCallback } from "@my-agent/core";
import { useEffect } from "react";

import { useStreamingStore } from "./use-streaming-store.js";

// ============================================================================
// Types
// ============================================================================

export interface StreamingOutput {
  stdout: string;
  stderr: string;
  timestamp: number;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to streaming output for a tool call.
 *
 * @param toolCallId - The tool call ID to subscribe to
 * @param enabled - Whether to enable streaming (default: true)
 * @returns Current streaming output or undefined if no data
 */
export function useStreamingOutput(toolCallId: string | undefined, enabled = true): StreamingOutput | undefined {
  const output = useStreamingStore((state) => (toolCallId ? state.outputs[toolCallId] : undefined));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Set up the global streaming callback
    setStreamingCallback((data) => {
      const { toolCallId: id, type, chunk } = data;
      const actions = useStreamingStore.getActions();
      if (type === "stdout") {
        actions.appendStdout(id, chunk);
      } else {
        actions.appendStderr(id, chunk);
      }
    });

    return () => {
      setStreamingCallback(null);
    };
  }, [enabled]);

  // Clean up when toolCallId changes or component unmounts
  useEffect(() => {
    return () => {
      if (toolCallId) {
        useStreamingStore.getActions().clear(toolCallId);
      }
    };
  }, [toolCallId]);

  return output;
}
