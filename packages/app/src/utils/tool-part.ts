/**
 * Thin re-exports of the core-owned tool-part helpers.
 *
 * The implementation moved to `@codent/core` (`agent/tools/presentation/tool-state.ts`)
 * so hosts that render off-process share exactly one implementation; this module keeps
 * the app's public surface stable.
 */
export {
  getUiToolState,
  isCancelledToolCall,
  isImagePart,
  isPendingToolApproval,
  isToolCallPart,
  isToolExecuting,
  parseToolInput,
  type UiToolState,
} from "@codent/core";
