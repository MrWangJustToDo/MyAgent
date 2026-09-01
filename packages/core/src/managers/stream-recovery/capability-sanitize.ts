import {
  sanitizeMessagesForCapabilities,
  trySanitizeForMultimodalRetry,
  unsupportedMultimodalPartTypes,
} from "../../models/adapter/capability-message-utils.js";

import type { ManagedAgent } from "../managed-agent.js";
import type { ModelMessage, UIMessage } from "@tanstack/ai";

/** Prepare messages for the wire: drop multimodal parts the model cannot accept. */
export function messagesForModelCapabilities(
  managed: ManagedAgent,
  messages: Array<UIMessage | ModelMessage>
): Array<UIMessage | ModelMessage> {
  const probe = managed.usage ?? null;
  const drop = unsupportedMultimodalPartTypes(probe);
  if (drop.size === 0) return messages;

  const sanitized = sanitizeMessagesForCapabilities(messages, probe);
  if (sanitized !== messages) {
    managed.log?.warn(
      "agent",
      `Stripping unsupported multimodal parts for model capabilities: ${[...drop].join(", ")}`
    );
  }
  return sanitized;
}

/**
 * One-shot retry without multimodal parts after a capability/schema API error.
 * Returns sanitized messages when a retry is warranted; otherwise null.
 */
export function tryCapabilitySanitizeRetry(
  managed: ManagedAgent,
  error: unknown,
  currentMessages: Array<UIMessage | ModelMessage>,
  multimodalStripAttempted: boolean
): Array<UIMessage | ModelMessage> | null {
  if (multimodalStripAttempted) return null;

  const stripped = trySanitizeForMultimodalRetry(error, currentMessages);
  if (!stripped) return null;

  managed.log?.warn(
    "agent",
    "Retrying without multimodal parts after capability/schema API error (UI history unchanged)"
  );
  managed.setError("");
  return stripped;
}
