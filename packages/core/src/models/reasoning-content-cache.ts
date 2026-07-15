/**
 * DeepSeek thinking-mode cache for Chat Completions adapters.
 *
 * TanStack may drop `message.thinking` when converting UI → model (thinking-only
 * assistants / split reasoning messageIds). We remember `reasoning_content` by
 * toolCallId from the stream so `convertMessage` can still echo it.
 */

export class ReasoningContentCache {
  private readonly byToolCallId = new Map<string, string>();
  private lastReasoning = "";

  clear(): void {
    this.byToolCallId.clear();
    this.lastReasoning = "";
  }

  remember(reasoning: string, toolCallIds: Iterable<string>): void {
    const content = reasoning.trim();
    if (!content) return;

    this.lastReasoning = content;
    for (const id of toolCallIds) {
      if (id) this.byToolCallId.set(id, content);
    }
  }

  /** Prefer toolCallId hits; fall back to the most recent reasoning for text-only turns. */
  lookup(toolCallIds: Iterable<string> | undefined, allowLast = false): string | undefined {
    if (toolCallIds) {
      for (const id of toolCallIds) {
        const hit = this.byToolCallId.get(id);
        if (hit) return hit;
      }
    }
    if (allowLast && this.lastReasoning) return this.lastReasoning;
    return undefined;
  }

  get size(): number {
    return this.byToolCallId.size;
  }
}
