import { generateText, streamText } from "xsai";

import { DEFAULT_OLLAMA_API_URL } from "./types.js";

import type { ChatMessage, ChatOptions, ChatResult } from "./schemas.js";

export interface StreamChatOptions extends ChatOptions {
  onToken?: (token: string) => void;
  onReasoning?: (token: string) => void;
  onComplete?: (text: string, reasoning?: string) => void;
}

/**
 * Send a chat message and get a response
 */
export const chat = async ({
  messages,
  model,
  baseURL = DEFAULT_OLLAMA_API_URL,
  systemPrompt,
}: ChatOptions): Promise<ChatResult> => {
  const allMessages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

  const response = await generateText({
    baseURL,
    messages: allMessages,
    model,
  });

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: response.text ?? "",
  };

  return {
    text: response.text ?? "",
    messages: [...messages, assistantMessage],
  };
};

/**
 * Stream a chat response token by token
 */
export const streamChat = async ({
  messages,
  model,
  baseURL = DEFAULT_OLLAMA_API_URL,
  systemPrompt,
  onToken,
  onReasoning,
  onComplete,
}: StreamChatOptions): Promise<ChatResult> => {
  const allMessages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

  const { textStream, reasoningTextStream } = streamText({
    baseURL,
    messages: allMessages,
    model,
  });

  let fullText = "";
  let fullReasoning = "";

  // Process both streams concurrently
  const processTextStream = async () => {
    const reader = textStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += value;
        onToken?.(value);
      }
    } finally {
      reader.releaseLock();
    }
  };

  const processReasoningStream = async () => {
    if (!onReasoning) return;
    const reader = reasoningTextStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullReasoning += value;
        onReasoning(value);
      }
    } finally {
      reader.releaseLock();
    }
  };

  await Promise.all([processTextStream(), processReasoningStream()]);

  onComplete?.(fullText, fullReasoning || undefined);

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: fullText,
  };

  return {
    text: fullText,
    messages: [...messages, assistantMessage],
  };
};

/**
 * Create a new chat conversation
 */
export const createChat = (systemPrompt?: string) => {
  let messages: ChatMessage[] = [];

  return {
    getMessages: () => [...messages],

    addUserMessage: (content: string) => {
      messages.push({ role: "user", content });
    },

    send: async (userMessage: string, options: Omit<ChatOptions, "messages" | "systemPrompt">): Promise<string> => {
      messages.push({ role: "user", content: userMessage });

      const result = await chat({
        messages,
        systemPrompt,
        ...options,
      });

      messages = result.messages;
      return result.text;
    },

    stream: async (
      userMessage: string,
      options: Omit<StreamChatOptions, "messages" | "systemPrompt">
    ): Promise<{ text: string; reasoning?: string }> => {
      messages.push({ role: "user", content: userMessage });

      let reasoning: string | undefined;
      const originalOnComplete = options.onComplete;

      const result = await streamChat({
        messages,
        systemPrompt,
        ...options,
        onComplete: (text, r) => {
          reasoning = r;
          originalOnComplete?.(text, r);
        },
      });

      messages = result.messages;
      return { text: result.text, reasoning };
    },

    clear: () => {
      messages = [];
    },
  };
};
