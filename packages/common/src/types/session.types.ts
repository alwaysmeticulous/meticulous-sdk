export interface RecordedSession {
  id: string;
  datetime: string;
  numberUserEvents: number;
  numberBytes: number;
  startUrl: string;
  abandoned: boolean;
  recordingToken: string;

  /**
   * Short AI-generated human readable description of what the user was doing in
   * the session (e.g. "Added an item to the cart"). Returned by the
   * `GET sessions/:id` REST endpoint. Only set for sessions from ~Mar 2025 that
   * have been selected, so `null` (or absent) for everything else.
   */
  description?: string | null;
}
