import type { JsonRecord } from "../utils/json-guards";
import { asNonEmptyString, asNumber, asRecord } from "../utils/json-guards";
import type { CodexSessionMeta } from "./parse-session-meta";
import { parseSessionMeta } from "./parse-session-meta";

/** A `{timestamp, ordinal?, type, payload}` rollout line. */
export interface RolloutLine {
  timestamp: string | null;
  /** Position in the thread's history; only paginated rollouts record it. */
  ordinal: number | null;
  type: string;
  payload: JsonRecord;
}

export const parseRolloutLine = (rawLine: string): RolloutLine | null => {
  let parsed: JsonRecord | null;
  try {
    parsed = asRecord(JSON.parse(rawLine));
  } catch {
    return null;
  }
  const type = asNonEmptyString(parsed?.["type"]);
  const payload = asRecord(parsed?.["payload"]);
  if (!parsed || !type || !payload) {
    return null;
  }
  const timestamp = asNonEmptyString(parsed["timestamp"]);
  return {
    timestamp:
      timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null,
    ordinal: asNumber(parsed["ordinal"]),
    type,
    payload,
  };
};

export const parseSessionMetaLine = (
  rawLine: string | null,
): CodexSessionMeta | null => {
  const line = rawLine ? parseRolloutLine(rawLine) : null;
  return line?.type === "session_meta" ? parseSessionMeta(line.payload) : null;
};
