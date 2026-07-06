/**
 * Streaming Callback — global callback for streaming tool output.
 *
 * The app package sets this callback to receive streaming updates.
 * The core package calls this during tool execution.
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

let streamingCallback: StreamingCallback | null = null;
let streamingClearCallback: StreamingClearCallback | null = null;

/**
 * Set the global streaming callback.
 * Called by the app package to register for streaming updates.
 */
export function setStreamingCallback(callback: StreamingCallback | null): void {
  streamingCallback = callback;
}

/**
 * Set the global streaming clear callback (resets UI buffer for a tool call).
 */
export function setStreamingClearCallback(callback: StreamingClearCallback | null): void {
  streamingClearCallback = callback;
}

/**
 * Get the current streaming callback.
 * Used by tools to emit streaming data.
 */
export function getStreamingCallback(): StreamingCallback | null {
  return streamingCallback;
}

/**
 * Emit a streaming chunk.
 * Called by tools during execution.
 */
export function emitStreamingChunk(toolCallId: string, type: "stdout" | "stderr", chunk: string): void {
  const callback = streamingCallback;
  if (callback) {
    callback({ toolCallId, type, chunk });
  }
}

/**
 * Clear streamed output for a tool call (e.g. before a subagent retry).
 */
export function clearStreamingOutput(toolCallId: string): void {
  streamingClearCallback?.(toolCallId);
}
