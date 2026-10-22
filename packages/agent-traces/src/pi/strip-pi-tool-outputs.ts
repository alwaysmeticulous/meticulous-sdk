import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import {
  keepOnly,
  rewriteJsonLinesFile,
} from "../tool-output-exclusion/rewrite-raw-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT } from "../tool-output-exclusion/tool-output-filter";
import { asNonEmptyString, asRecord } from "../utils/json-guards";

const KEPT_RESULT_KEYS = new Set([
  "role",
  "toolCallId",
  "toolName",
  "isError",
  "timestamp",
  "usage",
]);

export const stripPiToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] =>
  files.map((file) =>
    rewriteJsonLinesFile(file, (line) => {
      const message = asRecord(asRecord(line)?.["message"]);
      if (
        message?.["role"] !== "toolResult" ||
        !filter.isExcluded({
          names: [asNonEmptyString(message["toolName"])],
          callId: asNonEmptyString(message["toolCallId"]),
        })
      ) {
        return false;
      }
      keepOnly(message, KEPT_RESULT_KEYS, {
        content: [{ type: "text", text: EXCLUDED_TOOL_OUTPUT }],
      });
      return true;
    }),
  );
