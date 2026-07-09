/**
 * Headless TanStack stream consumption for subagents without {@link AgentUIChannel}.
 */

import { StreamProcessor } from "@tanstack/ai";

import type { StreamChunk, UIMessage } from "@tanstack/ai";

/**
 * Consume an agent run stream into final {@link UIMessage} snapshots.
 * No UI listeners, task-tool streaming, or approval bridging.
 */
export async function consumeStreamToMessages(stream: AsyncIterable<StreamChunk>): Promise<UIMessage[]> {
  const processor = new StreamProcessor();

  for await (const chunk of stream) {
    processor.processChunk(chunk);
  }

  processor.finalizeStream();
  return processor.getMessages();
}
