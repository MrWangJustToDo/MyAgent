import { Box, Text, useInput } from "ink";
import { useState } from "react";

import { COLORS } from "../theme/colors.js";
import { listNavHint } from "../utils/keyboard-labels.js";

import { TextInput } from "./TextInput.js";

import type { ModelsConfig } from "@my-agent/core";

// ============================================================================
// ConfigEditor — first-run model configuration editor
//
// Shared by all hosts (CLI etc.). A multi-step form that builds a minimal
// `models.config` with a single `direct` entry. The write/parse functions are
// injected so the app package stays decoupled from the concrete persistence
// implementation (core is a peer dependency); the CLI supplies core's
// parseModelsConfig / saveModelsConfig. After completion the config is written
// and the rest of startup reads it back through the same unified pipeline.
// ============================================================================

type StyleChoice = "openai" | "anthropic";

export const STYLE_OPTIONS: readonly StyleChoice[] = ["openai", "anthropic"];

type Step = "style" | "baseURL" | "apiKey" | "models" | "confirm";

export interface ConfigEditorProps {
  onDone: (config: ModelsConfig) => void;
  onCancel: () => void;
  /**
   * Persist a validated config to the file source. Injected by the host so the
   * app package does not depend on a specific storage implementation.
   */
  saveModelsConfig: (config: ModelsConfig) => Promise<void>;
  /** Validate + normalize a draft into a ModelsConfig, or null when invalid. */
  parseModelsConfig: (raw: string) => ModelsConfig;
}

interface Draft {
  style: StyleChoice;
  baseURL: string;
  apiKey: string;
  modelsCsv: string;
}

const DEFAULT_DRAFT: Draft = {
  style: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  modelsCsv: "",
};

function styleLabel(style: StyleChoice): string {
  return style === "openai" ? "openai" : "anthropic";
}

function parseDraft(draft: Draft, parse: ConfigEditorProps["parseModelsConfig"]): ModelsConfig | null {
  const models = draft.modelsCsv
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (models.length === 0) return null;
  if (!draft.baseURL.trim()) return null;
  try {
    return parse(
      JSON.stringify({
        models: [
          {
            type: "direct",
            style: draft.style,
            baseURL: draft.baseURL.trim(),
            ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
            models,
          },
        ],
      })
    );
  } catch {
    return null;
  }
}

export const ConfigEditor = ({ onDone, onCancel, saveModelsConfig, parseModelsConfig }: ConfigEditorProps) => {
  const [step, setStep] = useState<Step>("style");
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [styleIndex, setStyleIndex] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function commitText(): void {
    if (step === "baseURL") {
      setDraft((d) => ({ ...d, baseURL: text }));
      setText(draft.apiKey);
      setStep("apiKey");
      setError("");
    } else if (step === "apiKey") {
      setDraft((d) => ({ ...d, apiKey: text }));
      setText(draft.modelsCsv);
      setStep("models");
      setError("");
    } else if (step === "models") {
      setDraft((d) => ({ ...d, modelsCsv: text }));
      const config = parseDraft({ ...draft, modelsCsv: text }, parseModelsConfig);
      if (!config) {
        setError("Provide at least one model id (comma-separated).");
        return;
      }
      setStep("confirm");
      setError("");
    }
  }

  useInput((input, key) => {
    if (saving) return;

    if (key.escape) {
      onCancel();
      return;
    }

    if (step === "style") {
      if (key.upArrow) {
        setStyleIndex((i) => Math.max(0, i - 1));
        setError("");
        return;
      }
      if (key.downArrow) {
        setStyleIndex((i) => Math.min(STYLE_OPTIONS.length - 1, i + 1));
        setError("");
        return;
      }
      if (key.return) {
        setDraft((d) => ({ ...d, style: STYLE_OPTIONS[styleIndex] }));
        setStep("baseURL");
        setText(draft.baseURL);
        setError("");
      }
      return;
    }

    if (step === "confirm") {
      if (key.return) {
        void (async () => {
          const config = parseDraft(draft, parseModelsConfig);
          if (!config) return;
          setSaving(true);
          try {
            await saveModelsConfig(config);
            onDone(config);
          } catch (err) {
            setSaving(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        })();
      } else if (input === "e" || input === "E") {
        setStep("baseURL");
        setText(draft.baseURL);
        setError("");
      }
      return;
    }

    // Text input steps (baseURL / apiKey / models) are owned by <TextInput>,
    // which handles cursor navigation + editing. Return here so we don't double
    // handle return/backspace/typing with the focused TextInput.
    return;
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          My Agent — First-Run Model Configuration
        </Text>
        <Text dimColor> {step === "style" ? listNavHint("accept", "cancel") : "esc to cancel"}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {step === "style" && (
          <Box flexDirection="column" marginBottom={1}>
            <Text>Provider style:</Text>
            <Box flexDirection="column">
              {STYLE_OPTIONS.map((s, i) => {
                const selected = i === styleIndex;
                return (
                  <Box key={s} height={1} width="100%">
                    <Text color={selected ? COLORS.text : COLORS.muted} bold={selected}>
                      {selected ? "❯ " : "  "}
                      {styleLabel(s)}
                    </Text>
                    {selected && (
                      <Text color={COLORS.muted} dimColor>
                        {"  (selected)"}
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {step === "baseURL" && (
          <Box flexDirection="column">
            <Text>Base URL for the {styleLabel(draft.style)} API:</Text>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="https://..." />
          </Box>
        )}

        {step === "apiKey" && (
          <Box flexDirection="column">
            <Text>API key (empty to skip):</Text>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="(none)" mask />
          </Box>
        )}

        {step === "models" && (
          <Box flexDirection="column">
            <Text>Model ids (comma-separated, e.g. gpt-4o, gpt-4o-mini):</Text>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="gpt-4o, ..." />
          </Box>
        )}

        {step === "confirm" && (
          <Box flexDirection="column">
            <Text bold>Ready to write config:</Text>
            <Text>
              {"  style:   "}
              {styleLabel(draft.style)}
            </Text>
            <Text>
              {"  baseURL: "}
              {draft.baseURL.trim() || "(none)"}
            </Text>
            <Text>
              {"  apiKey:  "}
              {draft.apiKey.trim() ? "••••" : "(none)"}
            </Text>
            <Text>
              {"  models:  "}
              {draft.modelsCsv
                .split(",")
                .map((m) => m.trim())
                .filter(Boolean)
                .join(", ")}
            </Text>
            <Box marginTop={1}>
              <Text color={COLORS.primary}>Enter to save &amp; start</Text>
              <Text dimColor> · e to edit</Text>
            </Box>
          </Box>
        )}

        {saving && <Text dimColor>Saving config…</Text>}
        {error && <Text color={COLORS.danger}>✖ {error}</Text>}
      </Box>
    </Box>
  );
};
