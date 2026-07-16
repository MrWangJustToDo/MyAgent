/**
 * Short deterministic hex hash for clipboard payloads (filename / attachment id).
 * Not cryptographic — only needs uniqueness across pastes in a session.
 */
export function shortContentHash(payload: string, length = 8): string {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // unsigned 32-bit → hex, pad, take prefix
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  // Mix in length so tiny payload differences still diverge when FNV collides early
  const mix = (payload.length >>> 0).toString(16);
  return (hex + mix).slice(0, length);
}

/** Build a clipboard image filename from base64 (or raw) payload. */
export function clipboardImageFilename(base64Payload: string, ext = "png"): string {
  return `clipboard-${shortContentHash(base64Payload)}.${ext}`;
}
