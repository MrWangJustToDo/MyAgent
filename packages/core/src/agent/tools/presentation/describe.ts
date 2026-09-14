import type { ToolPresentation, ToolPresentationInfo } from "./types.js";

/** Serializable projection of a descriptor (functions dropped) for host consumption. */
export function describePresentation(name: string, present: ToolPresentation | undefined): ToolPresentationInfo {
  return {
    name,
    category: present?.category,
    keepRow: present?.keepRow,
    detailed: present?.detailed,
    clientSide: present?.clientSide,
    hasText: present?.text !== undefined,
    hasSummary: present?.summary !== undefined,
    labelKey: present?.labelKey,
  };
}
