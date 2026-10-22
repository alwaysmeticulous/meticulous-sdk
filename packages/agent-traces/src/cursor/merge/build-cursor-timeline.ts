import { assertNever } from "../../utils/assert-never";
import type { CursorHookEvent } from "../events/cursor-hook-event.types";
import type { CursorTranscriptEntry } from "../transcript/cursor-transcript.types";
import type { AnchorMatches } from "./align-anchors";
import { alignAnchors, toolUseKey } from "./align-anchors";
import { claimTextEvents } from "./claim-text-events";
import type { TextClaims } from "./claim-text-events";
import type { CursorTimelineItem } from "./cursor-timeline.types";

/**
 * Merges a transcript with its hook events. Each event either enriches the
 * transcript entry it describes (so nothing is counted twice) or, if none
 * does, is placed after the entry of the latest event that did. Either side
 * may be empty.
 */
export const buildCursorTimeline = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
): CursorTimelineItem[] => {
  const matches = alignAnchors(entries, events);
  const claims = claimTextEvents(entries, events, matches);
  const unpairedAfterEntry = placeUnpairedEvents(entries, events, matches);
  const timeline: CursorTimelineItem[] = [
    ...(unpairedAfterEntry.get(-1) ?? []),
  ];
  entries.forEach((entry, index) => {
    timeline.push(toItem(entry, index, events, matches, claims));
    timeline.push(...(unpairedAfterEntry.get(index) ?? []));
  });
  return timeline;
};

/**
 * A `stop` goes at the end of its turn, after any messages no event was
 * paired with, so its usage lands on the turn's last message.
 */
const placeUnpairedEvents = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
  matches: AnchorMatches,
): Map<number, CursorTimelineItem[]> => {
  const placed = new Map<number, CursorTimelineItem[]>();
  // Events can't predate the transcript's start, so ones before the first
  // paired event go just before its entry, or after the whole transcript.
  const firstPaired = events.findIndex((_, eventIndex) =>
    matches.entryByEvent.has(eventIndex),
  );
  let anchor = (matches.entryByEvent.get(firstPaired) ?? entries.length) - 1;
  events.forEach((event, eventIndex) => {
    const paired = matches.entryByEvent.get(eventIndex);
    if (paired !== undefined) {
      anchor = Math.max(anchor, paired);
      return;
    }
    const after =
      event.kind === "stop" && anchor >= 0
        ? endOfTurn(entries, anchor)
        : anchor;
    placed.set(after, [...(placed.get(after) ?? []), { kind: "event", event }]);
  });
  return placed;
};

const endOfTurn = (entries: CursorTranscriptEntry[], from: number): number => {
  for (let index = from + 1; index < entries.length; index++) {
    const kind = entries[index]?.kind;
    if (kind === "turn_ended") {
      return index;
    }
    if (kind === "user") {
      return index - 1;
    }
  }
  return entries.length - 1;
};

const toItem = (
  entry: CursorTranscriptEntry,
  index: number,
  events: CursorHookEvent[],
  matches: AnchorMatches,
  claims: TextClaims,
): CursorTimelineItem => {
  switch (entry.kind) {
    case "user": {
      const [event] = pickEvents(
        events,
        [matches.promptEventByEntry.get(index)],
        "prompt",
      );
      return { kind: "prompt", entry, event: event ?? null };
    }
    case "assistant":
      return {
        kind: "message",
        entry,
        toolEvents: entry.toolUses.map((_, useIndex) => {
          const eventIndex = matches.toolEventByUse.get(
            toolUseKey(index, useIndex),
          );
          return pickEvents(events, [eventIndex], "tool")[0] ?? null;
        }),
        thoughts: pickEvents(
          events,
          claims.thoughtsByEntry.get(index) ?? [],
          "thought",
        ),
        responses: pickEvents(
          events,
          claims.responsesByEntry.get(index) ?? [],
          "response",
        ),
      };
    case "turn_ended":
      return { kind: "turn_ended", entry };
    default:
      return assertNever(entry);
  }
};

const pickEvents = <K extends CursorHookEvent["kind"]>(
  events: CursorHookEvent[],
  indexes: Array<number | undefined>,
  kind: K,
): Array<Extract<CursorHookEvent, { kind: K }>> =>
  indexes.flatMap((eventIndex) => {
    const event = eventIndex === undefined ? undefined : events[eventIndex];
    return event?.kind === kind
      ? [event as Extract<CursorHookEvent, { kind: K }>]
      : [];
  });
