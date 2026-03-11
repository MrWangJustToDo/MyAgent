import { z } from "zod";

// Translation schemas
export const translateOptionsSchema = z.object({
  text: z.string().min(1),
  model: z.string(),
  source_lang: z.string().optional(),
  target_lang: z.string(),
  baseURL: z.string().url().optional(),
});

export const translateResultSchema = z.object({
  text: z.string(),
  source_lang: z.string().optional(),
  target_lang: z.string(),
});

export const detectOptionsSchema = z.object({
  text: z.string().min(1),
  model: z.string(),
  target_lang: z.string(),
  baseURL: z.string().url().optional(),
});

export const detectResultSchema = z.object({
  text: z.string(),
  source_lang: z.string(),
  target_lang: z.string(),
});

// Ollama schemas
export const ollamaConfigSchema = z.object({
  baseURL: z.string().url(),
  model: z.string(),
});

export const ollamaModelSchema = z.object({
  name: z.string(),
  model: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
  details: z.object({
    parent_model: z.string().optional(),
    format: z.string(),
    family: z.string(),
    families: z.array(z.string()).nullable().optional(),
    parameter_size: z.string(),
    quantization_level: z.string(),
  }),
});

export const ollamaModelsResponseSchema = z.object({
  models: z.array(ollamaModelSchema),
});

// Type exports from schemas
export type TranslateOptions = z.infer<typeof translateOptionsSchema>;
export type TranslateResult = z.infer<typeof translateResultSchema>;
export type DetectOptions = z.infer<typeof detectOptionsSchema>;
export type DetectResult = z.infer<typeof detectResultSchema>;
export type OllamaConfig = z.infer<typeof ollamaConfigSchema>;
export type OllamaModel = z.infer<typeof ollamaModelSchema>;
