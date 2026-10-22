import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import {
  forEachObject,
  keepOnly,
  rewriteJsonLinesFile,
} from "../tool-output-exclusion/rewrite-raw-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT } from "../tool-output-exclusion/tool-output-filter";
import { asNonEmptyString, asRecord, asString } from "../utils/json-guards";

const KEPT_RESULT_KEYS = new Set(["type", "tool_use_id", "is_error"]);
const LINE_OUTPUT_KEYS = ["toolUseResult", "mcpMeta"];
const AGENT_PROGRESS = "agent_progress";

/**
 * Tool results are `*tool_result` blocks keyed by `tool_use_id`, possibly
 * nested in progress lines, with the structured output alongside them in the
 * line's `toolUseResult`; progress lines stream output under `parentToolUseID`.
 */
export const stripClaudeCodeToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] => {
  const namesById = collectToolNames(files);
  const isExcluded = (id: string | null): boolean =>
    !!id && filter.isExcluded({ callId: id, names: [namesById.get(id)] });
  return files.map((file) =>
    isJsonLines(file)
      ? rewriteJsonLinesFile(file, (line) => stripLine(line, isExcluded))
      : file,
  );
};

const stripLine = (
  line: unknown,
  isExcluded: (id: string | null) => boolean,
): boolean => {
  const record = asRecord(line);
  if (!record) {
    return false;
  }
  let changed = stripProgress(record, isExcluded);
  forEachObject(record, (object) => {
    const type = asString(object["type"]);
    if (
      type?.endsWith("tool_result") &&
      isExcluded(asNonEmptyString(object["tool_use_id"]))
    ) {
      keepOnly(object, KEPT_RESULT_KEYS, { content: EXCLUDED_TOOL_OUTPUT });
      changed = true;
    }
  });
  if (changed) {
    for (const key of LINE_OUTPUT_KEYS) {
      if (key in record) {
        record[key] = EXCLUDED_TOOL_OUTPUT;
      }
    }
  }
  return changed;
};

const stripProgress = (
  record: Record<string, unknown>,
  isExcluded: (id: string | null) => boolean,
): boolean => {
  const data = asRecord(record["data"]);
  const dataType = asString(data?.["type"]);
  if (
    record["type"] !== "progress" ||
    !data ||
    dataType === AGENT_PROGRESS ||
    !(
      isExcluded(asNonEmptyString(record["parentToolUseID"])) ||
      isExcluded(asNonEmptyString(record["toolUseID"]))
    )
  ) {
    return false;
  }
  record["data"] = { type: dataType, output: EXCLUDED_TOOL_OUTPUT };
  return true;
};

const collectToolNames = (files: AgentTraceRawFile[]): Map<string, string> => {
  const names = new Map<string, string>();
  for (const file of files.filter(isJsonLines)) {
    for (const line of file.content.split("\n")) {
      if (!line.includes("tool_use")) {
        continue;
      }
      try {
        forEachObject(JSON.parse(line), (object) => {
          const id = asNonEmptyString(object["id"]);
          const name = asNonEmptyString(object["name"]);
          if (id && name && asString(object["type"])?.endsWith("tool_use")) {
            names.set(id, name);
          }
        });
      } catch {
        // Unparseable lines carry nothing the converter read either.
      }
    }
  }
  return names;
};

const isJsonLines = (file: AgentTraceRawFile): boolean =>
  file.relativePath.endsWith(".jsonl");
