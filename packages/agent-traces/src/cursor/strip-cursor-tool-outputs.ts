import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { stripHookEventFile } from "../tool-output-exclusion/strip-hook-event-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";
import { asNonEmptyString } from "../utils/json-guards";

const SUBAGENT_OUTPUT_KEYS = ["summary"];

/**
 * Cursor's transcripts record no tool outputs, so only its spooled hook
 * events carry them, plus `subagentStop`'s summary of a subagent tool call.
 */
export const stripCursorToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] =>
  files.map((file) =>
    stripHookEventFile(file, filter, (payload) =>
      filter.isExcluded({ callId: asNonEmptyString(payload["subagent_id"]) })
        ? SUBAGENT_OUTPUT_KEYS
        : [],
    ),
  );
