import { chat } from "@tanstack/ai";

import { createModel } from "../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../types.js";

import type { DetectOptions, DetectResult } from "../types.js";

export const detector = async ({
  text,
  model,
  target_lang,
  baseURL = DEFAULT_OLLAMA_API_URL,
}: DetectOptions): Promise<DetectResult> => {
  const modelInstance = createModel(model, baseURL);

  const response = await chat({
    adapter: modelInstance,
    systemPrompts: [
      `You are a professional language detector. please detect the language of the following text, and return the language code, do not give any text other than the detected language code. if the text is chinese, please just return "chinese"`,
    ],
    messages: [
      {
        role: "user",
        content: `Detect the language of the following text: ${text}`,
      },
    ],
    stream: false,
  });

  const detector_source_lang = response?.trim()?.toString();

  let final_target_lang = target_lang;

  if (detector_source_lang?.startsWith("chinese")) {
    final_target_lang = "english";
  }

  return {
    text,
    source_lang: detector_source_lang || "unknown",
    target_lang: final_target_lang,
  };
};
