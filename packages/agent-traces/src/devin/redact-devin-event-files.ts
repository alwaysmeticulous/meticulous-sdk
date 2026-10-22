import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { asRecord } from "../utils/json-guards";

export const REDACTED_ENV_VALUE = "[REDACTED]";

/**
 * Devin's `exec` tool input carries the environment it injects into the shell,
 * including session secrets, so its values are dropped before anything is
 * converted or uploaded. Files that don't parse are left alone: the converter
 * skips them anyway, and hook.sh writes payloads it never parses.
 */
export const redactDevinEventFiles = (
  files: AgentTraceRawFile[],
): AgentTraceRawFile[] => files.map(redactFile);

const redactFile = (file: AgentTraceRawFile): AgentTraceRawFile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    return file;
  }
  const env = asRecord(
    asRecord(asRecord(parsed)?.["payload"])?.["tool_input"],
  )?.["env"];
  const envRecord = asRecord(env);
  if (!envRecord || Object.keys(envRecord).length === 0) {
    return file;
  }
  for (const key of Object.keys(envRecord)) {
    envRecord[key] = REDACTED_ENV_VALUE;
  }
  const content = JSON.stringify(parsed);
  return {
    ...file,
    content,
    sizeBytes: Buffer.byteLength(content, "utf8"),
  };
};
