/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useUserInput } from "../hooks";
import { useAgent } from "../hooks/use-agent";
import { useAgentLog } from "../hooks/use-agent-log";
import { useStatic } from "../hooks/use-static";

/**
 * Dev-only reactivity touchpoints so Debug rebuilds when Session / log entries change.
 */
export const Debug = () => {
  // @ts-ignore
  useAgent((s) => s.session);
  // @ts-ignore
  useAgent((s) => s.host);
  // @ts-ignore
  useAgentLog((s) => s.version);

  // @ts-ignore
  useStatic();

  useUserInput((s) => s);

  return null;
};
