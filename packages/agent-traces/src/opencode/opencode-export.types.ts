import type { JsonRecord } from "../utils/json-guards";

/**
 * One root session as uploaded in the raw envelope: the shape of
 * `opencode export <id>` (`info` plus `messages`), with every descendant
 * subagent session alongside it. Message and part JSON is OpenCode's own,
 * unvalidated.
 */
export interface OpenCodeExport extends OpenCodeExportSession {
  /** Every descendant session, breadth first. */
  childSessions: OpenCodeExportSession[];
  /** Rows whose `data` column isn't a JSON object, kept verbatim. */
  malformedRows: OpenCodeMalformedRow[];
}

export interface OpenCodeExportSession {
  info: JsonRecord;
  messages: OpenCodeExportMessage[];
}

export interface OpenCodeExportMessage {
  info: JsonRecord;
  parts: JsonRecord[];
}

export interface OpenCodeMalformedRow {
  table: "message" | "part";
  id: string;
  data: unknown;
}
