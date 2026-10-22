import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { asNonEmptyString, asRecord } from "../utils/json-guards";
import { rewriteJsonFile } from "./rewrite-raw-file";
import type { ToolOutputFilter } from "./tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT } from "./tool-output-filter";

const OUTPUT_KEYS = [
  "tool_output",
  "tool_response",
  "tool_result",
  "error_message",
  "output",
  "result",
];

/**
 * Strips a spooled hook event for a call to an excluded tool, matched by its
 * `tool_name` or `tool_use_id`. `outputKeysOfOtherEvents` returns the output
 * keys of events that refer to an excluded call some other way.
 */
export const stripHookEventFile = (
  file: AgentTraceRawFile,
  filter: ToolOutputFilter,
  outputKeysOfOtherEvents?: (
    payload: Record<string, unknown>,
  ) => readonly string[],
): AgentTraceRawFile =>
  rewriteJsonFile(file, (event) => {
    const payload = asRecord(asRecord(event)?.["payload"]);
    if (!payload) {
      return false;
    }
    const keys = filter.isExcluded({
      names: [asNonEmptyString(payload["tool_name"])],
      callId: asNonEmptyString(payload["tool_use_id"]),
    })
      ? OUTPUT_KEYS
      : outputKeysOfOtherEvents?.(payload);
    const present = (keys ?? []).filter((key) => key in payload);
    for (const key of present) {
      payload[key] = EXCLUDED_TOOL_OUTPUT;
    }
    return present.length > 0;
  });
