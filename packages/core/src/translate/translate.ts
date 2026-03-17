import { generateText } from "ai";

import { createOllamaModel } from "../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../types.js";

import type { TranslateOptions, TranslateResult } from "../types.js";

export const translate = async ({
  text,
  model,
  source_lang,
  target_lang,
  baseURL = DEFAULT_OLLAMA_API_URL,
}: TranslateOptions): Promise<TranslateResult> => {
  const modelInstance = createOllamaModel(model, baseURL);

  const response = await generateText({
    model: modelInstance,
    system: `You are a professional translator. please translate the following in ${source_lang} into ${target_lang}, do not give any text other than the translated content, and trim the spaces at the end`,
    messages: [
      {
        role: "user",
        content: `Translate the following text: ${text}`,
      },
    ],
  });

  return {
    text: response.text ?? "",
    source_lang,
    target_lang,
  };
};
