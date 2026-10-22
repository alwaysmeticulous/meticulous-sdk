import { ATIF_EXTRA_DURATION_MS } from "../../atif/tool-result-duration";
import type {
  AtifObservationResult,
  AtifToolCall,
} from "../../types/atif.types";
import { truncateObservationContent } from "../../atif/truncate-observation-content";
import type { CursorToolEvent } from "../events/cursor-hook-event.types";

export const toToolCall = (
  id: string,
  functionName: string,
  args: Record<string, unknown>,
  hookToolName: string | null,
): AtifToolCall => ({
  tool_call_id: id,
  function_name: functionName,
  arguments: args,
  ...(hookToolName && hookToolName !== functionName
    ? { extra: { hook_tool_name: hookToolName } }
    : {}),
});

export const toToolResult = (
  id: string,
  event: CursorToolEvent,
): AtifObservationResult => {
  const { content, originalLength } = truncateObservationContent(event.output);
  return {
    source_call_id: id,
    content,
    extra: {
      is_error: event.isError,
      ...(event.durationMs !== null
        ? { [ATIF_EXTRA_DURATION_MS]: event.durationMs }
        : {}),
      ...(event.failureType ? { failure_type: event.failureType } : {}),
      ...(event.isInterrupt ? { is_interrupt: true } : {}),
      ...(originalLength !== null
        ? { truncated: true, original_length_chars: originalLength }
        : {}),
    },
  };
};
