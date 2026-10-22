import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import {
  forEachObject,
  keepOnly,
  rewriteJsonLinesFile,
} from "../tool-output-exclusion/rewrite-raw-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT } from "../tool-output-exclusion/tool-output-filter";
import { asNonEmptyString, asRecord, asString } from "../utils/json-guards";

const KEPT_EVENT_KEYS = new Set([
  "type",
  "id",
  "call_id",
  "turn_id",
  "status",
  "exit_code",
  "duration",
  "success",
  "process_id",
  "new_thread_id",
  "sender_thread_id",
  "receiver_thread_id",
  "internal_chat_message_metadata_passthrough",
]);
const KEPT_ITEM_KEYS = new Set([
  "type",
  "id",
  "status",
  "exit_code",
  "duration_ms",
  "command",
  "cwd",
  "process_id",
  "source",
  "tool",
  "server",
  "arguments",
  "sender_thread_id",
  "receiver_thread_ids",
]);

/**
 * Anything carrying an excluded `call_id` other than the call itself (a
 * `*_call` item or a `*_begin` event) is an output: `*_output` response items,
 * including those inside compactions' replacement history, and `*_end` and
 * delta events. `item_*` events key the item by its `id` instead.
 */
export const stripCodexToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] => {
  const namesByCallId = collectCallNames(files);
  const isExcluded = (callId: string | null): boolean =>
    !!callId &&
    filter.isExcluded({ callId, names: [namesByCallId.get(callId)] });
  return files.map((file) =>
    rewriteJsonLinesFile(file, (line) => {
      let changed = false;
      forEachObject(line, (object) => {
        changed = stripObject(object, isExcluded) || changed;
      });
      return changed;
    }),
  );
};

const stripObject = (
  object: Record<string, unknown>,
  isExcluded: (callId: string | null) => boolean,
): boolean => {
  const type = asString(object["type"]) ?? "";
  const item = asRecord(object["item"]);
  if (type.startsWith("item_") && item) {
    if (!isExcluded(asNonEmptyString(item["id"]))) {
      return false;
    }
    keepOnly(item, KEPT_ITEM_KEYS, { output: EXCLUDED_TOOL_OUTPUT });
    return true;
  }
  if (
    type.endsWith("_call") ||
    type.endsWith("_begin") ||
    !isExcluded(asNonEmptyString(object["call_id"]))
  ) {
    return false;
  }
  keepOnly(object, KEPT_EVENT_KEYS, { output: EXCLUDED_TOOL_OUTPUT });
  return true;
};

const collectCallNames = (files: AgentTraceRawFile[]): Map<string, string> => {
  const names = new Map<string, string>();
  for (const file of files) {
    for (const line of file.content.split("\n")) {
      if (!line.includes('"call_id"')) {
        continue;
      }
      try {
        forEachObject(JSON.parse(line), (object) => {
          const callId = asNonEmptyString(object["call_id"]);
          const name = asNonEmptyString(object["name"]);
          if (callId && name) {
            names.set(callId, name);
          }
        });
      } catch {
        // Unparseable lines carry nothing the converter read either.
      }
    }
  }
  return names;
};
