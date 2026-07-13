/** Minimum diff viewport height in terminal rows for in-message previews. */
export const MIN_MESSAGE_DIFF_HEIGHT = 28;

/**
 * Default scrollable diff height for tool/message previews:
 * max(floor(2/3 of terminal height), {@link MIN_MESSAGE_DIFF_HEIGHT}).
 */
export function getMessageDiffViewportHeight(screenHeight: number): number {
  if (screenHeight <= 0) return MIN_MESSAGE_DIFF_HEIGHT;
  return Math.max(Math.floor(screenHeight * (2 / 3)), MIN_MESSAGE_DIFF_HEIGHT);
}
