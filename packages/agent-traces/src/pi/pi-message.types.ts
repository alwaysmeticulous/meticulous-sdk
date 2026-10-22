/** Pi's `Usage`; `reasoning` is already included in `output`. */
export interface PiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number | null;
  reasoning: number | null;
  costUsd: number | null;
}

export interface PiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface PiContent {
  texts: string[];
  imageCount: number;
}

/** A parsed `message` entry's `message`, keyed by its `role`. */
export type PiMessage =
  | ({ role: "user" } & PiContent)
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | ({
      role: "custom";
      customType: string | null;
      display: boolean;
    } & PiContent)
  | { role: "branchSummary"; summary: string; fromId: string | null }
  | { role: "compactionSummary"; summary: string; tokensBefore: number | null }
  | { role: "system" }
  | { role: "other"; originalRole: string };

export interface PiAssistantMessage {
  role: "assistant";
  texts: string[];
  reasoning: string[];
  redactedThinkingCount: number;
  toolCalls: PiToolCall[];
  otherBlockTypes: string[];
  provider: string | null;
  api: string | null;
  model: string | null;
  responseModel: string | null;
  responseId: string | null;
  thinkingLevel: string | null;
  stopReason: string | null;
  errorMessage: string | null;
  usage: PiUsage | null;
}

export interface PiToolResultMessage {
  role: "toolResult";
  toolCallId: string | null;
  toolName: string | null;
  content: PiContent;
  isError: boolean;
  /** Nested model work done by the tool itself. */
  usage: PiUsage | null;
}

/** A shell command the user ran directly with `!`, not an LLM tool call. */
export interface PiBashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | null;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath: string | null;
  excludeFromContext: boolean;
}
