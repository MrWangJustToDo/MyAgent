/**
 * use-streaming-output — React hook for subscribing to real-time tool output.
 *
 * Uses reactivity-store for automatic UI updates. Throttling is applied at the
 * consumer via {@link UseStreamingOutputOptions.throttleMs}.
 */

import { subscribeStreamingCallback, subscribeStreamingClearCallback } from "@my-agent/core";
import { useEffect } from "react";

import { clearStreamingIngest, ingestStreamingChunk, registerStreamingThrottle } from "./streaming-ingest.js";
import { useStreamingStore } from "./use-streaming-store.js";

import type { StreamingOutput } from "./use-streaming-store.js";

// ============================================================================
// Types
// ============================================================================

export interface UseStreamingOutputOptions {
  /** Whether to subscribe (default: true). */
  enabled?: boolean;
  /**
   * Minimum ms between reactive store updates for this tool call.
   * `0` flushes every chunk (default).
   */
  throttleMs?: number;
}

// ============================================================================
// Bridge (ref-counted — one store bridge, many hook consumers)
// ============================================================================

let bridgeRefCount = 0;
let unsubscribeBridge: (() => void) | undefined;

function acquireStreamingBridge(): void {
  bridgeRefCount += 1;
  if (bridgeRefCount > 1) return;

  const unsubChunk = subscribeStreamingCallback(({ toolCallId, type, chunk }) => {
    ingestStreamingChunk(toolCallId, type, chunk);
  });

  const unsubClear = subscribeStreamingClearCallback((toolCallId) => {
    clearStreamingIngest(toolCallId);
  });

  unsubscribeBridge = () => {
    unsubChunk();
    unsubClear();
  };
}

function releaseStreamingBridge(): void {
  bridgeRefCount -= 1;
  if (bridgeRefCount > 0) return;
  unsubscribeBridge?.();
  unsubscribeBridge = undefined;
}

function resolveOptions(options?: boolean | UseStreamingOutputOptions): Required<UseStreamingOutputOptions> {
  if (typeof options === "boolean") {
    return { enabled: options, throttleMs: 0 };
  }
  return {
    enabled: options?.enabled ?? true,
    throttleMs: options?.throttleMs ?? 0,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to streaming output for a tool call.
 *
 * @param toolCallId - The tool call ID to subscribe to
 * @param options - `enabled` and/or `throttleMs` (or legacy boolean for enabled)
 */
export function useStreamingOutput(
  toolCallId: string | undefined,
  options?: boolean | UseStreamingOutputOptions
): StreamingOutput | undefined {
  const { enabled, throttleMs } = resolveOptions(options);
  const output = useStreamingStore((state) => (toolCallId ? state.outputs[toolCallId] : undefined));

  useEffect(() => {
    if (!enabled) return;
    acquireStreamingBridge();
    return () => {
      releaseStreamingBridge();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !toolCallId) return;
    return registerStreamingThrottle(toolCallId, throttleMs);
  }, [enabled, toolCallId, throttleMs]);

  useEffect(() => {
    return () => {
      if (toolCallId) {
        clearStreamingIngest(toolCallId);
      }
    };
  }, [toolCallId]);

  return output;
}
