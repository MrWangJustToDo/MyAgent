/**
 * Session row for the resume picker (subset of disk SessionMeta).
 * Matches `session.list` dispatch payload.
 */
export interface SessionListItem {
  id: string;
  name: string;
  model: string;
  updatedAt: number;
  createdAt?: number;
}
