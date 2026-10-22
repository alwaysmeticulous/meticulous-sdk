import { asRecord, asString } from "../utils/json-guards";
import type { ParsedPiSession, PiEntry } from "./pi-entry.types";
import { parsePiUsage } from "./pi-usage";

export interface PiSessionMetadata {
  cwd: string | null;
  /** Set with `/name`; null if never set or cleared. */
  name: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Across every branch, matching Pi's own session stats; null if no usage carried a cost. */
  reportedCostUsd: number | null;
}

/** Session-wide facts, read from every entry rather than just the active branch. */
export const collectPiMetadata = ({
  header,
  entries,
}: ParsedPiSession): PiSessionMetadata => {
  const timestamps = [
    header?.timestamp ?? null,
    ...entries.map((e) => e.timestamp),
  ]
    .filter((t): t is string => t !== null && !Number.isNaN(Date.parse(t)))
    .sort();
  const latestSessionInfo = entries
    .filter((entry) => entry.type === "session_info")
    .at(-1);
  return {
    cwd: header?.cwd ?? null,
    name: asString(latestSessionInfo?.raw["name"])?.trim() || null,
    startedAt: timestamps[0] ?? null,
    endedAt: timestamps.at(-1) ?? null,
    reportedCostUsd: sumReportedCost(entries),
  };
};

/** Mirrors which entries Pi's `getSessionStats` adds to the session cost. */
const sumReportedCost = (entries: PiEntry[]): number | null => {
  let total: number | null = null;
  for (const entry of entries) {
    const cost = parsePiUsage(findUsage(entry))?.costUsd ?? null;
    if (cost !== null) {
      total = (total ?? 0) + cost;
    }
  }
  return total;
};

const findUsage = (entry: PiEntry): unknown => {
  switch (entry.type) {
    case "usage":
    case "compaction":
    case "branch_summary":
      return entry.raw["usage"];
    case "message": {
      const message = asRecord(entry.raw["message"]);
      const role = message?.["role"];
      return role === "assistant" || role === "toolResult"
        ? message?.["usage"]
        : null;
    }
    default:
      return null;
  }
};
