import {
  clearFlatMessageCache,
  getFlatMessage,
  setFlatMessage,
  type CachedFlatMessage,
} from "../utils/message-flat-cache.js";

export type { CachedFlatMessage };

/**
 * Flatten cache access. Kept as a named export for existing imports; storage is a
 * plain Map so getMessages can write during render without reactive store updates.
 */
export const useMessageCache = {
  getActions: () => ({
    setMessage: setFlatMessage,
    getMessage: getFlatMessage,
    clear: clearFlatMessageCache,
  }),
};
