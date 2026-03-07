import { generateText, streamText } from "xsai";

import { DEFAULT_OLLAMA_API_URL } from "./types.js";

import type { ChatMessage, ChatOptions, ChatResult } from "./schemas.js";

export interface StreamChatOptions extends ChatOptions {
  onToken?: (token: string) => void;
  onComplete?: (text: string) => void;
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
  onComplete,
}: StreamChatOptions): Promise<ChatResult> => {
  const allMessages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

  const { textStream } = streamText({
    baseURL,
    messages: allMessages,
    model,
  });

  let fullText = "";

  for await (const chunk of textStream) {
    fullText += chunk;
    onToken?.(chunk);
  }

  onComplete?.(fullText);

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
    ): Promise<string> => {
      messages.push({ role: "user", content: userMessage });

      const result = await streamChat({
        messages,
        systemPrompt,
        ...options,
      });

      messages = result.messages;
      return result.text;
    },

    clear: () => {
      messages = [];
    },
  };
};
