/**
 * Thin re-exports of the core-owned tool-part helpers.
 *
 * The implementation moved to `@my-agent/core` (`agent/tools/presentation/tool-state.ts`)
 * so hosts that render off-process share exactly one implementation; this module keeps
 * the app's public surface stable.
 */
export {
  getUiToolState,
  isImagePart,
  isPendingToolApproval,
  isToolCallPart,
  isToolExecuting,
  parseToolInput,
  type UiToolState,
} from "@my-agent/core";
