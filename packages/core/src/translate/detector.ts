import { generateText } from "ai";

import { createOllamaModel } from "../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../types.js";

import type { DetectOptions, DetectResult } from "../types.js";

export const detector = async ({
  text,
  model,
  target_lang,
  baseURL = DEFAULT_OLLAMA_API_URL,
}: DetectOptions): Promise<DetectResult> => {
  const modelInstance = createOllamaModel(model, baseURL);

  const response = await generateText({
    model: modelInstance,
    system: `You are a professional language detector. please detect the language of the following text, and return the language code, do not give any text other than the detected language code. if the text is chinese, please just return "chinese"`,
    messages: [
      {
        role: "user",
        content: `Detect the language of the following text: ${text}`,
      },
    ],
  });

  const detector_source_lang = response.text?.trim()?.toString();

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
