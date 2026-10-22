import type { SessionPayload } from "../upload/session-payload.types";
import {
  collectExcludedCallIds,
  stripAtifToolOutputs,
} from "./strip-atif-tool-outputs";
import { stripAtifRawFiles } from "./strip-atif-raw-files";
import { createToolOutputFilter } from "./tool-output-filter";
import { TOOL_OUTPUT_STRIPPERS } from "./tool-output-strippers";

/**
 * Replaces the output of every call to a tool whose name one of `regexes`
 * matches, in both the ATIF and the raw files, keeping the call itself.
 */
export const excludeToolOutputs = (
  payload: SessionPayload,
  regexes: RegExp[],
): SessionPayload => {
  if (regexes.length === 0) {
    return payload;
  }
  const filter = createToolOutputFilter(
    regexes,
    collectExcludedCallIds(payload.trajectory, regexes),
  );
  const { envelope } = payload;
  const stripRawFiles =
    envelope.rawFormat === "atif"
      ? stripAtifRawFiles
      : TOOL_OUTPUT_STRIPPERS[envelope.agent];
  return {
    ...payload,
    trajectory: stripAtifToolOutputs(payload.trajectory, filter),
    envelope: {
      ...envelope,
      files: stripRawFiles(envelope.files, filter),
    },
  };
};
