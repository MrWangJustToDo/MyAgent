/**
 * Streaming Callback — agent-scoped multicast bridge for tool stdout/stderr.
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

export interface StreamingSubscribeOptions {
  /** Only receive chunks/clears emitted for this agent. */
  agentId: string;
}

export interface StreamingEmitOptions {
  /** Target agent scope. */
  agentId: string;
}

// ============================================================================
// State
// ============================================================================

const scopedChunkCallbacks = new Map<string, Set<StreamingCallback>>();
const scopedClearCallbacks = new Map<string, Set<StreamingClearCallback>>();

function addScoped<T>(map: Map<string, Set<T>>, agentId: string, callback: T): () => void {
  let set = map.get(agentId);
  if (!set) {
    set = new Set();
    map.set(agentId, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) map.delete(agentId);
  };
}

/**
 * @internal Package-internal / `dev.ts` validates. Hosts must use `ManagedAgent.observe({ onStreaming })`.
 */
export function subscribeStreamingCallback(
  callback: StreamingCallback,
  options: StreamingSubscribeOptions
): () => void {
  return addScoped(scopedChunkCallbacks, options.agentId, callback);
}

/**
 * @internal Package-internal / `dev.ts` validates. Hosts must use `ManagedAgent.observe({ onStreamingClear })`.
 */
export function subscribeStreamingClearCallback(
  callback: StreamingClearCallback,
  options: StreamingSubscribeOptions
): () => void {
  return addScoped(scopedClearCallbacks, options.agentId, callback);
}

/**
 * Emit a streaming chunk to subscribers of {@link StreamingEmitOptions.agentId}.
 */
export function emitStreamingChunk(
  toolCallId: string,
  type: "stdout" | "stderr",
  chunk: string,
  options: StreamingEmitOptions
): void {
  const set = scopedChunkCallbacks.get(options.agentId);
  if (!set) return;
  const data: StreamingChunk = { toolCallId, type, chunk };
  for (const callback of set) {
    callback(data);
  }
}

/**
 * Clear streamed output for a tool call (e.g. before a subagent retry).
 */
export function clearStreamingOutput(toolCallId: string, options: StreamingEmitOptions): void {
  const set = scopedClearCallbacks.get(options.agentId);
  if (!set) return;
  for (const callback of set) {
    callback(toolCallId);
  }
}

/** Exposed for validation scripts. */
export function getStreamingSubscriberCounts(): {
  chunk: number;
  clear: number;
  scopedChunkAgents: number;
  scopedClearAgents: number;
} {
  let chunk = 0;
  for (const set of scopedChunkCallbacks.values()) chunk += set.size;
  let clear = 0;
  for (const set of scopedClearCallbacks.values()) clear += set.size;
  return {
    chunk,
    clear,
    scopedChunkAgents: scopedChunkCallbacks.size,
    scopedClearAgents: scopedClearCallbacks.size,
  };
}

/** Reset all subscribers (validation only). */
export function resetStreamingCallbacksForTests(): void {
  scopedChunkCallbacks.clear();
  scopedClearCallbacks.clear();
}
