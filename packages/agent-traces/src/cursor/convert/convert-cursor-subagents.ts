import { basename } from "path";
import type {
  CursorHookEvent,
  CursorSubagentStopEvent,
} from "../events/cursor-hook-event.types";
import { normalizeText } from "../merge/match-weights";
import type { ParsedCursorTranscript } from "../transcript/cursor-transcript.types";
import type { ConvertedCursorTrajectory } from "./convert-cursor-trajectory";
import { convertCursorTrajectory } from "./convert-cursor-trajectory";

export interface CursorSubagentSource {
  subagentId: string;
  transcript: ParsedCursorTranscript | null;
  /** Events spooled under the subagent's own conversation id. */
  events: CursorHookEvent[];
}

export interface ConvertedCursorSubagent {
  trajectoryId: string;
  converted: ConvertedCursorTrajectory;
  /** The tool call that spawned it, when hook events say. */
  parentToolCallId: string | null;
  /** What it was asked to do, to find its tool call when no id links them. */
  task: string | null;
}

interface SubagentInput {
  sessionId: string;
  rootEvents: CursorHookEvent[];
  subagents: CursorSubagentSource[];
  agentVersion: string | null;
}

/**
 * Converts each subagent transcript, plus subagent tool calls the root's
 * events reported under a `parent_tool_call_id` that no transcript claims.
 * Returns the root's own events with those removed.
 */
export const convertCursorSubagents = ({
  sessionId,
  rootEvents,
  subagents,
  agentVersion,
}: SubagentInput): {
  rootOwnEvents: CursorHookEvent[];
  converted: ConvertedCursorSubagent[];
} => {
  const rootOwnEvents = rootEvents.filter((event) => !event.parentToolCallId);
  const delegated = groupByParentToolCall(rootEvents);
  const stops = rootOwnEvents.filter(
    (event): event is CursorSubagentStopEvent => event.kind === "subagent_stop",
  );
  const convert = (
    trajectoryId: string,
    source: Omit<CursorSubagentSource, "subagentId">,
    stop: CursorSubagentStopEvent | null,
    parentToolCallId: string | null,
  ): ConvertedCursorSubagent => ({
    trajectoryId,
    parentToolCallId,
    task: stop?.task ?? firstPrompt(source.transcript),
    converted: convertCursorTrajectory({
      sessionId,
      trajectoryId,
      transcript: source.transcript,
      events: source.events,
      agentVersion,
      extra: {
        subagent_type: stop?.subagentType ?? null,
        description: stop?.description ?? null,
        subagent_status: stop?.status ?? null,
        ...(stop?.durationMs ? { duration_ms: stop.durationMs } : {}),
      },
    }),
  });

  const converted = subagents.map((subagent) => {
    const stop =
      stops.find((candidate) =>
        describesChild(
          candidate,
          subagent.subagentId,
          firstPrompt(subagent.transcript),
        ),
      ) ?? null;
    const parentToolCallId = stop?.subagentId ?? null;
    const reported = parentToolCallId
      ? (delegated.get(parentToolCallId) ?? [])
      : [];
    delegated.delete(parentToolCallId ?? "");
    return convert(
      `subagent-${subagent.subagentId}`,
      {
        transcript: subagent.transcript,
        events: byTime([...subagent.events, ...reported]),
      },
      stop,
      parentToolCallId,
    );
  });
  for (const [parentToolCallId, events] of delegated) {
    const stop =
      stops.find((candidate) => candidate.subagentId === parentToolCallId) ??
      null;
    converted.push(
      convert(
        `tool-call-${parentToolCallId.replace(/\s+/g, "_")}`,
        { transcript: null, events },
        stop,
        parentToolCallId,
      ),
    );
  }
  return { rootOwnEvents, converted };
};

/** Cursor often leaves out the child's id and transcript path, so the task is a fallback. */
const describesChild = (
  stop: CursorSubagentStopEvent,
  childId: string,
  childPrompt: string | null,
): boolean => {
  const transcriptName = stop.agentTranscriptPath
    ? basename(stop.agentTranscriptPath)
    : null;
  return (
    stop.childConversationId === childId ||
    transcriptName === `${childId}.jsonl` ||
    transcriptName === `${childId}.txt` ||
    (stop.task !== null &&
      childPrompt !== null &&
      normalizeText(stop.task) === normalizeText(childPrompt))
  );
};

const groupByParentToolCall = (
  events: CursorHookEvent[],
): Map<string, CursorHookEvent[]> => {
  const groups = new Map<string, CursorHookEvent[]>();
  for (const event of events) {
    if (event.parentToolCallId) {
      groups.set(event.parentToolCallId, [
        ...(groups.get(event.parentToolCallId) ?? []),
        event,
      ]);
    }
  }
  return groups;
};

const byTime = (events: CursorHookEvent[]): CursorHookEvent[] =>
  [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

const firstPrompt = (
  transcript: ParsedCursorTranscript | null,
): string | null => {
  const entry = transcript?.entries.find(
    (candidate) => candidate.kind === "user",
  );
  return entry?.kind === "user" ? entry.text : null;
};
