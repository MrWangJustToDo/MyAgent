/**
 * PatchedDirectChatTransport - A patched version of DirectChatTransport that fixes
 * the tool approval denial bug in Vercel AI SDK v6.
 *
 * Bug: When a user denies a tool call via addToolApprovalResponse({approved: false}),
 * the SDK sets state to 'approval-responded' but convertToModelMessages doesn't
 * handle this state, so no tool_result is sent to the model. The model then
 * assumes the tool succeeded.
 *
 * Fix: Preprocess messages before conversion to transform 'approval-responded' with
 * approved=false into 'output-denied' state with proper error output.
 *
 * Related issues:
 * - https://github.com/vercel/ai/issues/10980
 * - https://github.com/vercel/ai/issues/13057
 * - https://github.com/vercel/ai/issues/13670
 */

import { convertToModelMessages, validateUIMessages } from "ai";

import type { Agent } from "../loop/agent.js";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

// ============================================================================
// Types
// ============================================================================

type UIMessageStreamOptions<UI_MESSAGE> = {
  originalMessages?: UI_MESSAGE[];
  sendReasoning?: boolean;
  sendSources?: boolean;
  sendFinishEvents?: boolean;
  messageIdGenerator?: () => string;
};

// ============================================================================
// UI Message Preprocessing Utilities
// ============================================================================

/**
 * Tool UI part type for type casting during preprocessing.
 * We use a mutable version since we need to modify the state.
 */
interface MutableToolUIPart {
  type: string;
  state?: string;
  toolCallId: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
  };
}

/**
 * Check if a message part is a tool UI part.
 */
function isToolUIPart(part: unknown): part is MutableToolUIPart {
  if (!part || typeof part !== "object") return false;
  const p = part as Record<string, unknown>;
  return typeof p.type === "string" && (p.type.startsWith("tool-") || p.type === "dynamic-tool");
}

/**
 * Mutable message type for preprocessing.
 */
interface MutableUIMessage {
  role: string;
  parts?: unknown[];
  [key: string]: unknown;
}

/**
 * Preprocess UI messages to fix the tool approval denial bug in Vercel AI SDK v6.
 *
 * Bug: When a user denies a tool call via addToolApprovalResponse({approved: false}),
 * the SDK sets state to 'approval-responded' but convertToModelMessages doesn't
 * handle this state properly, so no tool_result is sent to the model. The model then
 * assumes the tool succeeded.
 *
 * Fix: Transform 'approval-responded' with approved=false into 'output-denied' state.
 * This ensures convertToModelMessages will generate a proper tool_result with the
 * denial message for the model.
 *
 * Related issues:
 * - https://github.com/vercel/ai/issues/10980
 * - https://github.com/vercel/ai/issues/13057
 * - https://github.com/vercel/ai/issues/13670
 *
 * @param messages - UI messages to preprocess
 * @returns Preprocessed UI messages with fixed approval states
 */
export function preprocessUIMessagesForDeniedApprovals<T extends UIMessage>(messages: T[]): T[] {
  // Deep clone to avoid mutating original messages
  const clonedMessages = JSON.parse(JSON.stringify(messages)) as MutableUIMessage[];

  for (const message of clonedMessages) {
    if (message.role !== "assistant" || !message.parts) {
      continue;
    }

    for (const part of message.parts) {
      if (!isToolUIPart(part)) {
        continue;
      }

      // Check if this is an approval-responded state that was denied
      const isDeniedApproval = part.state === "approval-responded" && part.approval?.approved === false;

      if (!isDeniedApproval) {
        continue;
      }

      // Transform to output-denied state
      // This makes convertToModelMessages generate a proper tool_result with error
      // `addToolApprovalResponse` only change the message state to `approval-responded`
      // SEE https://github.com/vercel/ai/blob/50c29b0dc2d23dff959bde8eea21594ba61c46c6/packages/ai/src/ui/convert-to-model-messages.ts#L47
      part.state = "output-denied";

      // The approval.reason should contain the denial message
      // convertToModelMessages will use this when state is 'output-denied'
    }
  }

  return clonedMessages as unknown as T[];
}

export type PatchedDirectChatTransportOptions<UI_MESSAGE extends UIMessage> = {
  /**
   * The agent to use for generating responses.
   */
  agent: Agent;

  /**
   * Options to pass to the agent when calling it.
   */
  options?: never;
} & Omit<UIMessageStreamOptions<UI_MESSAGE>, "onFinish">;

// ============================================================================
// PatchedDirectChatTransport Class
// ============================================================================

/**
 * A patched transport that directly communicates with an Agent in-process,
 * with a fix for the tool approval denial bug.
 *
 * @example
 * ```tsx
 * import { useChat } from '@ai-sdk/react';
 * import { PatchedDirectChatTransport } from '@my-agent/core';
 * import { myAgent } from './my-agent';
 *
 * const { messages, sendMessage } = useChat({
 *   transport: new PatchedDirectChatTransport({ agent: myAgent }),
 * });
 * ```
 */
export class PatchedDirectChatTransport<UI_MESSAGE extends UIMessage = UIMessage> implements ChatTransport<UI_MESSAGE> {
  private readonly agent: Agent;
  private readonly uiMessageStreamOptions: Omit<UIMessageStreamOptions<UI_MESSAGE>, "onFinish">;

  constructor({ agent, ...uiMessageStreamOptions }: PatchedDirectChatTransportOptions<UI_MESSAGE>) {
    this.agent = agent;
    this.uiMessageStreamOptions = uiMessageStreamOptions;
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    // PATCH: Preprocess messages to fix denied approvals
    // Transform 'approval-responded' with approved=false to 'output-denied'
    const preprocessedMessages = preprocessUIMessagesForDeniedApprovals(messages);

    // Validate the incoming UI messages
    // Note: Using type assertion due to complex SDK generic constraints
    const validatedMessages = await validateUIMessages<UI_MESSAGE>({
      messages: preprocessedMessages,
      tools: this.agent.tools as never,
    });

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(validatedMessages, {
      tools: this.agent.tools as never,
    });

    // Stream from the agent
    const result = await this.agent.stream({
      prompt: modelMessages,
      abortSignal,
    });

    // Return the UI message stream
    return result.toUIMessageStream(this.uiMessageStreamOptions);
  }

  /**
   * Direct transport does not support reconnection since there is no
   * persistent server-side stream to reconnect to.
   *
   * @returns Always returns `null`
   */
  async reconnectToStream(
    _options: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
