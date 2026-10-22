import type { JsonRecord } from "../utils/json-guards";

/** The first line of a Pi session file; not part of the entry tree. */
export interface PiSessionHeader {
  id: string | null;
  version: number;
  cwd: string | null;
  timestamp: string | null;
  parentSession: string | null;
}

/** Any non-header line. `type` is e.g. `message`, `compaction`, `session_info`. */
export interface PiEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string | null;
  raw: JsonRecord;
}

export interface ParsedPiSession {
  header: PiSessionHeader | null;
  /** In file order. */
  entries: PiEntry[];
  malformedLineCount: number;
}
