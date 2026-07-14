/**
 * @deprecated Import from `./capability-message-utils.js` instead.
 * Re-exports kept so existing callers keep working during the vision → capability rename.
 */

export {
  IMAGE_OMITTED_PLACEHOLDER,
  MULTIMODAL_OMITTED_PLACEHOLDER,
  chatMessagesHaveImages,
  chatMessagesHaveMultimodal,
  isMultimodalUnsupportedError,
  isVisionUnsupportedError,
  sanitizeMessagesForCapabilities,
  stripImagesFromChatMessages,
  stripMultimodalFromChatMessages,
  trySanitizeForMultimodalRetry,
  tryStripImagesForVisionRetry,
  unsupportedMultimodalPartTypes,
  MULTIMODAL_PART_CAPABILITY,
} from "./capability-message-utils.js";

export type { CapabilityProbe, MultimodalPartType } from "./capability-message-utils.js";
