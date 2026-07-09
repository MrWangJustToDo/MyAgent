/**
 * Streaming Callback — multicast bridge for streaming tool output.
 *
 * Multiple consumers (e.g. run_command + task summary streams) can subscribe
 * concurrently. The app layer typically installs one bridge into the streaming store.
 */

// ============================================================================
// Types
// ============================================================================

export interface StreamingChunk {
  toolCallId: string;
  type: "stdout" | "stderr";
  chunk: string;
}

export type StreamingCallback = (data: StreamingChunk) => void;

export type StreamingClearCallback = (toolCallId: string) => void;

// ============================================================================
// Global State
// ============================================================================

const streamingCallbacks = new Set<StreamingCallback>();
const streamingClearCallbacks = new Set<StreamingClearCallback>();

/**
 * Subscribe to streaming chunks. Returns an unsubscribe function.
 */
export function subscribeStreamingCallback(callback: StreamingCallback): () => void {
  streamingCallbacks.add(callback);
  return () => {
    streamingCallbacks.delete(callback);
  };
}

/**
 * Subscribe to streaming clear events. Returns an unsubscribe function.
 */
export function subscribeStreamingClearCallback(callback: StreamingClearCallback): () => void {
  streamingClearCallbacks.add(callback);
  return () => {
    streamingClearCallbacks.delete(callback);
  };
}

/**
 * Emit a streaming chunk to all subscribers.
 * Called by tools during execution.
 */
export function emitStreamingChunk(toolCallId: string, type: "stdout" | "stderr", chunk: string): void {
  const data: StreamingChunk = { toolCallId, type, chunk };
  for (const callback of streamingCallbacks) {
    callback(data);
  }
}

/**
 * Clear streamed output for a tool call (e.g. before a subagent retry).
 */
export function clearStreamingOutput(toolCallId: string): void {
  for (const callback of streamingClearCallbacks) {
    callback(toolCallId);
  }
}

/** Exposed for validation scripts. */
export function getStreamingSubscriberCounts(): { chunk: number; clear: number } {
  return { chunk: streamingCallbacks.size, clear: streamingClearCallbacks.size };
}
