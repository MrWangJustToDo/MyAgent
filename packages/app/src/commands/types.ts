import type { AgentAdapter, CommandResult } from "../adapter/types.js";
import type { useUserInput } from "../hooks/use-user-input.js";
import type { ManagedAgent } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

/**
 * Context passed to every command's execute function.
 */
export interface CommandContext {
  /** Actions from useUserInput */
  inputActions: ReturnType<typeof useUserInput.getActions>;
  /** Get readonly snapshot of current input state */
  getInputState: () => ReturnType<typeof useUserInput.getReadonlyState>;
  /** Get the current agent instance (may be null if not initialized) */
  getAgent: () => ManagedAgent | null;
  /** Set chat messages (for commands that manipulate conversation history) */
  setMessages?: (messages: UIMessage[]) => void;
  /** Read current chat messages (full UI history) */
  getMessages?: () => UIMessage[];
  /** Persist `useChat` messages to session (single write path for `uiMessages`) */
  saveSessionFromChat?: () => void;
  /** Exit the application */
  exit?: () => void;
  /** Agent adapter for platform-specific operations */
  adapter?: AgentAdapter;
}

export type { CommandResult };

/**
 * A submenu option for commands with choices.
 */
export interface CommandOption {
  /** Display label */
  label: string;
  /** Value to use when selected */
  value: string;
  /** Optional description */
  description?: string;
  /**
   * When true, selecting this option executes with the text the user typed
   * after `/{command}` (custom input), not {@link value}.
   */
  freeform?: boolean;
}

/**
 * A slash command definition.
 */
export interface Command {
  /** Command name without leading slash (e.g. "attach") */
  name: string;
  /** Short description for /help output */
  description: string;
  /** Usage string (e.g. "/attach <file-path>") */
  usage: string;
  /** Execute the command. `args` is everything after "/name " trimmed. */
  execute: (args: string, ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  /**
   * If true, execute immediately when selected from autocomplete (no args).
   * Mutually exclusive with opening a submenu via {@link getOptions} — `immediate` wins.
   */
  immediate?: boolean;
  /** Dynamic options for submenu (e.g., theme list). Called when command is selected. */
  getOptions?: (ctx?: CommandContext) => CommandOption[] | Promise<CommandOption[]>;
  /**
   * When true with {@link getOptions}, autocomplete keeps a freeform row so users
   * can type a custom value (session name, rename title, etc.).
   */
  allowCustomInput?: boolean;
}
