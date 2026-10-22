/** A spooled Cursor hook payload, narrowed to what conversion uses. */
export type CursorHookEvent =
  | CursorPromptEvent
  | CursorThoughtEvent
  | CursorResponseEvent
  | CursorToolEvent
  | CursorStopEvent
  | CursorSubagentStartEvent
  | CursorSubagentStopEvent
  | CursorCompactionEvent;

export interface CursorHookEventBase {
  /** ISO 8601, from when hook.sh spooled it. */
  timestamp: string;
  generationId: string | null;
  model: string | null;
  /** Set on tool calls a subagent made, when reported via its parent. */
  parentToolCallId: string | null;
}

/** `beforeSubmitPrompt` */
export interface CursorPromptEvent extends CursorHookEventBase {
  kind: "prompt";
  prompt: string;
  attachments: unknown[];
  composerMode: string | null;
}

/** `afterAgentThought`: one reasoning block. */
export interface CursorThoughtEvent extends CursorHookEventBase {
  kind: "thought";
  text: string;
  durationMs: number | null;
}

/** `afterAgentResponse`: the turn's final message. */
export interface CursorResponseEvent extends CursorHookEventBase {
  kind: "response";
  text: string;
  usage: CursorTokenUsage | null;
}

/** `postToolUse` or `postToolUseFailure`. */
export interface CursorToolEvent extends CursorHookEventBase {
  kind: "tool";
  toolName: string;
  toolInput: unknown;
  toolUseId: string | null;
  /** The output (JSON-encoded by Cursor), or the failure's error message. */
  output: string;
  isError: boolean;
  durationMs: number | null;
  failureType: string | null;
  isInterrupt: boolean;
  cwd: string | null;
}

/** `stop`: the end of a generation. */
export interface CursorStopEvent extends CursorHookEventBase {
  kind: "stop";
  status: string | null;
  loopCount: number | null;
  usage: CursorTokenUsage | null;
}

export interface CursorSubagentStartEvent extends CursorHookEventBase {
  kind: "subagent_start";
  subagentId: string | null;
  toolCallId: string | null;
}

export interface CursorSubagentStopEvent extends CursorHookEventBase {
  kind: "subagent_stop";
  /** In practice the parent's tool call id. */
  subagentId: string | null;
  childConversationId: string | null;
  agentTranscriptPath: string | null;
  subagentType: string | null;
  status: string | null;
  task: string | null;
  description: string | null;
  summary: string | null;
  durationMs: number | null;
}

/** `preCompact` */
export interface CursorCompactionEvent extends CursorHookEventBase {
  kind: "compaction";
  trigger: string | null;
  contextTokens: number | null;
}

/** Per generation, summed over its model calls. Input includes cache reads and writes. */
export interface CursorTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
