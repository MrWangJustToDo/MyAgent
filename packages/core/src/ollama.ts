import { z } from "zod";

import { ollamaModelsResponseSchema, type OllamaModel } from "./schemas.js";
import { DEFAULT_OLLAMA_URL } from "./types.js";

export const ollamaShowResponseSchema = z.object({
  modelfile: z.string(),
  parameters: z.string(),
  template: z.string(),
  details: z.object({
    parent_model: z.string().optional(),
    format: z.string(),
    family: z.string(),
    families: z.array(z.string()).nullable().optional(),
    parameter_size: z.string(),
    quantization_level: z.string(),
  }),
});

export type OllamaShowResponse = z.infer<typeof ollamaShowResponseSchema>;

/**
 * Get list of available models from Ollama
 */
export const getModels = async (baseURL: string = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> => {
  const response = await fetch(`${baseURL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }
  const data = ollamaModelsResponseSchema.parse(await response.json());
  return data.models;
};

/**
 * Get details about a specific model
 */
export const getModelInfo = async (
  model: string,
  baseURL: string = DEFAULT_OLLAMA_URL
): Promise<OllamaShowResponse> => {
  const response = await fetch(`${baseURL}/api/show`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: model }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch model info: ${response.statusText}`);
  }
  return ollamaShowResponseSchema.parse(await response.json());
};

/**
 * Check if Ollama server is running
 */
export const checkConnection = async (baseURL: string = DEFAULT_OLLAMA_URL): Promise<boolean> => {
  try {
    const response = await fetch(`${baseURL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
};
