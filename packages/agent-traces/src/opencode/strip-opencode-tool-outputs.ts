import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { rewriteJsonFile } from "../tool-output-exclusion/rewrite-raw-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT } from "../tool-output-exclusion/tool-output-filter";
import type { JsonRecord } from "../utils/json-guards";
import { asArray, asNonEmptyString, asRecord } from "../utils/json-guards";
import { formatOpenCodeExport } from "./format-opencode-export";

const OUTPUT_KEYS = ["output", "error"];
const DROPPED_KEYS = ["attachments"];
const KEPT_METADATA_KEYS = ["sessionId"];

/**
 * A tool part keeps its call and outcome together in `state`; its output,
 * error, attachments and metadata (which can preview the output) go.
 */
export const stripOpenCodeToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] =>
  files.map((file) =>
    rewriteJsonFile(
      file,
      (exported) => {
        const excluded = toolParts(exported).filter((part) =>
          filter.isExcluded({
            names: [asNonEmptyString(part["tool"])],
            callId:
              asNonEmptyString(part["callID"]) ?? asNonEmptyString(part["id"]),
          }),
        );
        excluded.forEach(stripPart);
        return excluded.length > 0;
      },
      formatOpenCodeExport,
    ),
  );

const stripPart = (part: JsonRecord): void => {
  const state = asRecord(part["state"]);
  if (!state) {
    return;
  }
  for (const key of OUTPUT_KEYS) {
    if (key in state) {
      state[key] = EXCLUDED_TOOL_OUTPUT;
    }
  }
  for (const key of DROPPED_KEYS) {
    delete state[key];
  }
  const metadata = asRecord(state["metadata"]);
  if (metadata) {
    state["metadata"] = Object.fromEntries(
      KEPT_METADATA_KEYS.filter((key) => key in metadata).map((key) => [
        key,
        metadata[key],
      ]),
    );
  }
};

const toolParts = (exported: unknown): JsonRecord[] => {
  const root = asRecord(exported);
  const sessions = [root, ...(asArray(root?.["childSessions"]) ?? [])];
  return sessions.flatMap((session) =>
    records(asRecord(session)?.["messages"]).flatMap((message) =>
      records(message["parts"]).filter((part) => part["type"] === "tool"),
    ),
  );
};

const records = (value: unknown): JsonRecord[] =>
  (asArray(value) ?? []).flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
