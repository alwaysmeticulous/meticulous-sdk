import type { JsonRecord } from "../utils/json-guards";
import {
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../utils/json-guards";
import type {
  ParsedPiSession,
  PiEntry,
  PiSessionHeader,
} from "./pi-entry.types";

/**
 * Parses a Pi session JSONL file. Unparseable lines are counted and skipped:
 * the last line may be mid-write while a session is live. Entries without an
 * id (version 1 files, from before Pi added the entry tree) are chained in
 * file order, which is how Pi itself migrates them.
 */
export const parsePiSession = (text: string): ParsedPiSession => {
  const lines = text.split("\n").filter((line) => line.trim());
  const parsed: ParsedPiSession = {
    header: null,
    entries: [],
    malformedLineCount: 0,
  };
  for (const [index, rawLine] of lines.entries()) {
    const line = parseJsonLine(rawLine);
    if (!line) {
      parsed.malformedLineCount++;
      continue;
    }
    if (line["type"] === "session" && !parsed.header) {
      parsed.header = toHeader(line);
      continue;
    }
    parsed.entries.push(toEntry(line, index, parsed.entries.at(-1)));
  }
  return parsed;
};

const toEntry = (
  line: JsonRecord,
  index: number,
  previous: PiEntry | undefined,
): PiEntry => {
  const id = asNonEmptyString(line["id"]);
  return {
    type: asString(line["type"]) ?? "",
    id: id ?? `line-${index + 1}`,
    parentId: id ? asNonEmptyString(line["parentId"]) : (previous?.id ?? null),
    timestamp: asNonEmptyString(line["timestamp"]),
    raw: line,
  };
};

const toHeader = (line: JsonRecord): PiSessionHeader => ({
  id: asNonEmptyString(line["id"]),
  version: asNumber(line["version"]) ?? 1,
  cwd: asNonEmptyString(line["cwd"]),
  timestamp: asNonEmptyString(line["timestamp"]),
  parentSession: asNonEmptyString(line["parentSession"]),
});

const parseJsonLine = (rawLine: string): JsonRecord | null => {
  try {
    const parsed = asRecord(JSON.parse(rawLine));
    return parsed && asString(parsed["type"]) !== null ? parsed : null;
  } catch {
    return null;
  }
};
