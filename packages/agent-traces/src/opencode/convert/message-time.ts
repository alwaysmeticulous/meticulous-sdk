import type { JsonRecord } from "../../utils/json-guards";
import { asNumber, asRecord } from "../../utils/json-guards";

/** A message's `time.created` or `time.completed` (epoch ms) as ISO 8601. */
export const messageTimestamp = (
  info: JsonRecord,
  field: "created" | "completed",
): string | null => {
  const ms = messageTimeMs(info, field);
  return ms !== null ? new Date(ms).toISOString() : null;
};

export const messageTimeMs = (
  info: JsonRecord,
  field: "created" | "completed",
): number | null => {
  const ms = asNumber(asRecord(info["time"])?.[field]);
  return ms !== null && ms > 0 && ms < 8.64e15 ? ms : null;
};
