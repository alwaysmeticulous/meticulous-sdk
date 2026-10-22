import { stripClaudeCodeToolOutputs } from "../claude-code/strip-claude-code-tool-outputs";
import { stripCodexToolOutputs } from "../codex/strip-codex-tool-outputs";
import { stripCursorToolOutputs } from "../cursor/strip-cursor-tool-outputs";
import { stripDevinToolOutputs } from "../devin/strip-devin-tool-outputs";
import { stripOpenCodeToolOutputs } from "../opencode/strip-opencode-tool-outputs";
import { stripPiToolOutputs } from "../pi/strip-pi-tool-outputs";
import type { AgentTraceAgent } from "../types/constants";
import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { stripAtifRawFiles } from "./strip-atif-raw-files";
import type { ToolOutputFilter } from "./tool-output-filter";

/** Replaces the outputs of excluded tool calls in a session's raw files. */
export type ToolOutputStripper = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
) => AgentTraceRawFile[];

export const TOOL_OUTPUT_STRIPPERS: {
  [A in AgentTraceAgent]: ToolOutputStripper;
} = {
  "claude-code": stripClaudeCodeToolOutputs,
  devin: stripDevinToolOutputs,
  pi: stripPiToolOutputs,
  opencode: stripOpenCodeToolOutputs,
  codex: stripCodexToolOutputs,
  cursor: stripCursorToolOutputs,
  other: stripAtifRawFiles,
};
