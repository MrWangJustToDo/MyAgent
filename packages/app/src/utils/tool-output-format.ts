/**
 * Thin re-exports of the core-owned tool-output formatters.
 *
 * Core renders the result text at tool completion and ships it with the message
 * (`part.display.text`), so the same implementation serves local and off-process hosts.
 */
export { formatToolArgs, formatToolOutput } from "@codent/core";
