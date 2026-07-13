/** Keep `index` visible inside a `[scrollTop, scrollTop + visibleCount)` window. */
export function ensureIndexVisible(index: number, scrollTop: number, visibleCount: number, totalCount: number): number {
  if (totalCount <= visibleCount) return 0;
  const maxScroll = Math.max(0, totalCount - visibleCount);
  if (index < scrollTop) return index;
  if (index >= scrollTop + visibleCount) {
    return Math.min(index - visibleCount + 1, maxScroll);
  }
  return scrollTop;
}

export function clampScrollTop(scrollTop: number, totalLines: number, visibleLines: number): number {
  const maxScroll = Math.max(0, totalLines - visibleLines);
  return Math.max(0, Math.min(scrollTop, maxScroll));
}
