import { asNonEmptyString, asRecord, asString } from "../utils/json-guards";
import type { CodexEntry, CodexEntryBody } from "./codex-entry.types";
import type { EventMsgState } from "./parse-event-msg";
import {
  createEventMsgState,
  parseEventMsg,
  recordSpawnFromOutput,
} from "./parse-event-msg";
import { parseResponseItem } from "./parse-response-item";
import type { RolloutLine } from "./parse-rollout-line";
import { parseRolloutLine } from "./parse-rollout-line";
import { parseSessionMeta } from "./parse-session-meta";
import { parseTokenUsage } from "./parse-token-usage";
import type { RolloutFileContext } from "./rollout-file-context";
import { findRevertCutoffs, toPosition } from "./rollout-file-context";
import type { CodexThreadMetadata } from "./thread-metadata";
import {
  createEmptyMetadata,
  recordSessionMeta,
  recordTimestamp,
} from "./thread-metadata";

export interface RolloutFileText {
  rolloutId: string;
  text: string;
}

export interface ParsedThread {
  entries: CodexEntry[];
  metadata: CodexThreadMetadata;
  events: EventMsgState;
}

/**
 * Parses a thread's rollout files in order. Unparseable lines are counted
 * and skipped: the last line is often mid-write while a session is live.
 */
export const parseThread = (files: RolloutFileText[]): ParsedThread => {
  const revertCutoffs = findRevertCutoffs(files);
  const parsed: ParsedThread = {
    entries: [],
    metadata: createEmptyMetadata(),
    events: createEventMsgState(),
  };
  let syntheticIdCount = 0;
  const syntheticId = () => `codex-item-${++syntheticIdCount}`;
  for (const file of files) {
    const context: RolloutFileContext = {
      revertedFrom: revertCutoffs.get(file.rolloutId) ?? null,
      copiedBefore: null,
      sawSessionMeta: false,
    };
    for (const rawLine of file.text.split("\n")) {
      if (!rawLine.trim()) {
        continue;
      }
      const line = parseRolloutLine(rawLine);
      if (!line) {
        parsed.metadata.malformedLineCount++;
        continue;
      }
      const position = toPosition(line, context);
      if (!position.copied) {
        recordTimestamp(parsed.metadata, line.timestamp);
      }
      for (const body of toEntries(line, parsed, context, syntheticId)) {
        recordSpawnFromOutput(body, parsed.events);
        parsed.entries.push({ ...body, ...position });
      }
    }
  }
  return parsed;
};

const toEntries = (
  line: RolloutLine,
  parsed: ParsedThread,
  context: RolloutFileContext,
  syntheticId: () => string,
): CodexEntryBody[] => {
  const { payload } = line;
  switch (line.type) {
    case "session_meta":
      if (!context.sawSessionMeta) {
        context.sawSessionMeta = true;
        const meta = parseSessionMeta(payload);
        context.copiedBefore = meta.subagentHistoryStartOrdinal;
        recordSessionMeta(parsed.metadata, meta);
      }
      return [];
    case "turn_context":
      return [parseTurnContext(payload, parsed.metadata)];
    case "response_item":
      return parseResponseItem(payload, syntheticId);
    case "event_msg":
      return parseEventMsg(payload, parsed.events);
    case "token_usage_record": {
      parsed.events.usageRecordPending = true;
      const usage = parseTokenUsage(payload["usage"]);
      const responseId = asNonEmptyString(payload["response_id"]);
      return usage ? [{ kind: "usage", usage, responseId }] : [];
    }
    case "compacted":
      return [
        { kind: "compaction", summary: asString(payload["message"]) ?? "" },
      ];
    case "inter_agent_communication":
      return [
        {
          kind: "user",
          text: asString(payload["content"]) ?? "",
          originKind: "inter_agent_communication",
        },
      ];
    default:
      return [];
  }
};

const parseTurnContext = (
  payload: Record<string, unknown>,
  metadata: CodexThreadMetadata,
): CodexEntryBody => {
  const collaborationMode = asNonEmptyString(
    asRecord(payload["collaboration_mode"])?.["mode"],
  );
  if (
    collaborationMode &&
    !metadata.collaborationModes.includes(collaborationMode)
  ) {
    metadata.collaborationModes.push(collaborationMode);
  }
  const cwd = asNonEmptyString(payload["cwd"]);
  metadata.cwd ??= cwd;
  return {
    kind: "turn-context",
    model: asNonEmptyString(payload["model"]),
    effort: asNonEmptyString(payload["effort"]),
  };
};
