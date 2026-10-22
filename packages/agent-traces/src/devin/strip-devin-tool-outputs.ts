import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { stripHookEventFile } from "../tool-output-exclusion/strip-hook-event-file";
import type { ToolOutputFilter } from "../tool-output-exclusion/tool-output-filter";

export const stripDevinToolOutputs = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] => files.map((file) => stripHookEventFile(file, filter));
