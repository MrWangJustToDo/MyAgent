import { translate, detector, DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { Box, Text, useApp } from "ink";
import { useState, useEffect } from "react";

import { parseArgs, getFlagString } from "../hooks/useArgs.js";

import { Spinner } from "./Spinner.js";

export interface TranslateProps {
  args: string[];
}

interface TranslateResult {
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  targetText: string;
}

export const Translate = ({ args }: TranslateProps) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<"loading" | "detecting" | "translating" | "success" | "error">("loading");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string>("");

  const parsed = parseArgs(args);
  const text = parsed.positional[0] || "";
  const url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");
  const model = getFlagString(parsed, "llama3.2", "model", "m");
  const targetLang = getFlagString(parsed, "chinese", "target", "t");
  const sourceLang = getFlagString(parsed, "", "source", "s");

  useEffect(() => {
    if (!text) {
      setError('No text provided. Usage: my-agent translate "text to translate"');
      setStatus("error");
      setTimeout(() => exit(), 100);
      return;
    }

    const doTranslate = async () => {
      try {
        const baseURL = `${url}/v1/`;
        let detectedSourceLang = sourceLang;
        let finalTargetLang = targetLang;

        if (!sourceLang) {
          setStatus("detecting");
          const detected = await detector({
            text,
            model,
            target_lang: targetLang,
            baseURL,
          });
          detectedSourceLang = detected.source_lang;
          finalTargetLang = detected.target_lang;
        }

        setStatus("translating");
        const translated = await translate({
          text,
          model,
          source_lang: detectedSourceLang,
          target_lang: finalTargetLang,
          baseURL,
        });

        setResult({
          sourceLang: detectedSourceLang,
          targetLang: finalTargetLang,
          sourceText: text,
          targetText: translated.text,
        });
        setStatus("success");
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }

      setTimeout(() => exit(), 100);
    };

    doTranslate();
  }, [text, url, model, targetLang, sourceLang]);

  if (status === "loading" || status === "detecting") {
    return (
      <Box padding={1}>
        <Spinner text="Detecting language..." />
      </Box>
    );
  }

  if (status === "translating") {
    return (
      <Box padding={1}>
        <Spinner text="Translating..." />
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box padding={1} flexDirection="column">
        <Box>
          <Text color="red">✗</Text>
          <Text> Translation failed</Text>
        </Box>
        <Text color="gray">{error}</Text>
      </Box>
    );
  }

  if (!result) return null;

  return (
    <Box padding={1} flexDirection="column">
      <Box marginBottom={1}>
        <Text color="green">✓</Text>
        <Text> Translation complete</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Language: </Text>
          <Text color="cyan">{result.sourceLang}</Text>
          <Text color="gray"> → </Text>
          <Text color="cyan">{result.targetLang}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">Source:</Text>
        <Text>{result.sourceText}</Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray">Result:</Text>
        <Text color="green">{result.targetText}</Text>
      </Box>
    </Box>
  );
};
