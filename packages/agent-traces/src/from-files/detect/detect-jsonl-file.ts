import { parseSessionMetaLine } from "../../codex/parse-rollout-line";
import { assertNever } from "../../utils/assert-never";
import type { JsonRecord } from "../../utils/json-guards";
import { asNonEmptyString, asRecord } from "../../utils/json-guards";
import type {
  DetectedTraceFile,
  FileTraceAgent,
  TraceFile,
} from "../trace-files.types";
import { sniffJsonlFormat } from "./sniff-trace-content";

type JsonlFormat = NonNullable<ReturnType<typeof sniffJsonlFormat>>;

export const detectJsonlFile = (
  file: TraceFile,
  headLines: string[],
  agentOverride: FileTraceAgent | null,
): DetectedTraceFile | null => {
  const records = headLines.flatMap(parseRecord);
  const format = agentOverride
    ? jsonlFormatOf(agentOverride)
    : sniffJsonlFormat(records);
  switch (format) {
    case null:
      return null;
    case "codex":
      return {
        ...file,
        format,
        meta: parseSessionMetaLine(
          headLines.find((line) => parseRecord(line).length > 0) ?? null,
        ),
      };
    case "pi":
      return {
        ...file,
        format,
        headerId:
          records[0]?.["type"] === "session"
            ? asNonEmptyString(records[0]["id"])
            : null,
      };
    case "cursor":
      return { ...file, format };
    case "claude-code":
      return {
        ...file,
        format,
        sessionId: firstString(records, "sessionId"),
        agentId: firstString(records, "agentId"),
        isSidechain: records.some((record) => record["isSidechain"] === true),
      };
    default:
      return assertNever(format);
  }
};

const jsonlFormatOf = (agent: FileTraceAgent): JsonlFormat | null => {
  switch (agent) {
    case "claude-code":
    case "codex":
    case "pi":
    case "cursor":
      return agent;
    case "opencode":
    case "other":
      return null;
    default:
      return assertNever(agent);
  }
};

const parseRecord = (line: string): JsonRecord[] => {
  if (!line.trim()) {
    return [];
  }
  try {
    const record = asRecord(JSON.parse(line));
    return record ? [record] : [];
  } catch {
    return [];
  }
};

const firstString = (records: JsonRecord[], key: string): string | null =>
  records.map((record) => asNonEmptyString(record[key])).find(Boolean) ?? null;
