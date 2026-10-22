import type {
  AtifObservationResult,
  AtifToolCall,
} from "../../types/atif.types";
import { truncateObservationContent } from "../../atif/truncate-observation-content";
import type { JsonRecord } from "../../utils/json-guards";
import {
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../../utils/json-guards";

const TASK_TOOL_NAME = "task";
const TASK_OUTPUT_SESSION_ID_REGEX = /<task id="([^"]+)"/;

export interface ConvertedToolPart {
  call: AtifToolCall;
  /** Null while the call hadn't finished when the session was read. */
  result: AtifObservationResult | null;
  /** The subagent session a `task` call ran in. */
  childSessionId: string | null;
}

/**
 * OpenCode keeps a call and its outcome in the same part, so its result
 * always belongs on the step that issued it.
 */
export const toolPartToCall = (part: JsonRecord): ConvertedToolPart => {
  const state = asRecord(part["state"]) ?? {};
  const status = asString(state["status"]);
  const toolName = asNonEmptyString(part["tool"]) ?? "unknown";
  const toolCallId =
    asNonEmptyString(part["callID"]) ?? asNonEmptyString(part["id"]) ?? "";
  const title = asNonEmptyString(state["title"]);
  const isFinished = status === "completed" || status === "error";
  const call: AtifToolCall = {
    tool_call_id: toolCallId,
    function_name: toolName,
    arguments: asRecord(state["input"]) ?? {},
    ...(title || !isFinished
      ? {
          extra: {
            ...(title ? { title } : {}),
            ...(!isFinished ? { status: status ?? "unknown" } : {}),
          },
        }
      : {}),
  };
  return {
    call,
    result: isFinished ? toResult(toolCallId, state, status === "error") : null,
    childSessionId:
      toolName === TASK_TOOL_NAME ? findChildSessionId(state) : null,
  };
};

const toResult = (
  toolCallId: string,
  state: JsonRecord,
  isError: boolean,
): AtifObservationResult => {
  const raw = asString(state[isError ? "error" : "output"]) ?? "";
  const { content, originalLength } = truncateObservationContent(raw);
  const time = asRecord(state["time"]);
  const attachments = Array.isArray(state["attachments"])
    ? state["attachments"].length
    : 0;
  return {
    source_call_id: toolCallId,
    content,
    extra: {
      is_error: isError,
      ...(originalLength !== null
        ? { truncated: true, original_length_chars: originalLength }
        : {}),
      ...(asNumber(time?.["compacted"]) !== null
        ? { pruned_from_context: true }
        : {}),
      ...(attachments > 0 ? { attachment_count: attachments } : {}),
    },
  };
};

const findChildSessionId = (state: JsonRecord): string | null =>
  asNonEmptyString(asRecord(state["metadata"])?.["sessionId"]) ??
  TASK_OUTPUT_SESSION_ID_REGEX.exec(asString(state["output"]) ?? "")?.[1] ??
  null;
