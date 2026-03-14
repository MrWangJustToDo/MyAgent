import { chat } from "@tanstack/ai";

import { createModel } from "../provider.js";
import { DEFAULT_OLLAMA_API_URL } from "../types.js";

import type { TranslateOptions, TranslateResult } from "../types.js";

export const translate = async ({
  text,
  model,
  source_lang,
  target_lang,
  baseURL = DEFAULT_OLLAMA_API_URL,
}: TranslateOptions): Promise<TranslateResult> => {
  const modelInstance = createModel(model, baseURL);

  const response = await chat({
    adapter: modelInstance,
    systemPrompts: [
      `You are a professional translator. please translate the following in ${source_lang} into ${target_lang}, do not give any text other than the translated content, and trim the spaces at the end`,
    ],
    messages: [
      {
        role: "user",
        content: `Translate the following text: ${text}`,
      },
    ],
    stream: false,
  });

  return {
    text: response ?? "",
    source_lang,
    target_lang,
  };
};
