import { assertNever } from "../../utils/assert-never";
import { asNonEmptyString, asRecord } from "../../utils/json-guards";
import type {
  DetectedTraceFile,
  FileTraceAgent,
  TraceFile,
} from "../trace-files.types";
import { isClaudeCodeSubagentMetaName } from "./claude-code-file-names";
import { sniffJsonFormat } from "./sniff-trace-content";

type JsonFormat = NonNullable<ReturnType<typeof sniffJsonFormat>>;

/** `value` is undefined when the file isn't valid JSON. */
export const detectJsonFile = (
  file: TraceFile,
  value: unknown,
  agentOverride: FileTraceAgent | null,
): DetectedTraceFile | null => {
  const record = asRecord(value);
  if (
    isClaudeCodeSubagentMetaName(file.path) &&
    (!agentOverride || agentOverride === "claude-code")
  ) {
    return record ? { ...file, format: "claude-code-subagent-meta" } : null;
  }
  const format = agentOverride
    ? jsonFormatOf(agentOverride)
    : sniffJsonFormat(value);
  switch (format) {
    case null:
      return null;
    case "atif":
      return {
        ...file,
        format,
        sessionId: asNonEmptyString(record?.["session_id"]),
        agentName: asNonEmptyString(asRecord(record?.["agent"])?.["name"]),
      };
    case "opencode": {
      const info = asRecord(record?.["info"]);
      return {
        ...file,
        format,
        id: asNonEmptyString(info?.["id"]),
        parentId: asNonEmptyString(info?.["parentID"]),
      };
    }
    default:
      return assertNever(format);
  }
};

const jsonFormatOf = (agent: FileTraceAgent): JsonFormat | null => {
  switch (agent) {
    case "opencode":
      return "opencode";
    case "other":
      return "atif";
    case "claude-code":
    case "codex":
    case "pi":
    case "cursor":
      return null;
    default:
      return assertNever(agent);
  }
};
