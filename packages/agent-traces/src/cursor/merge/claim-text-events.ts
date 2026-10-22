import type { CursorHookEvent } from "../events/cursor-hook-event.types";
import type {
  CursorAssistantEntry,
  CursorTranscriptEntry,
} from "../transcript/cursor-transcript.types";
import type { AnchorMatches } from "./align-anchors";
import { normalizeText } from "./match-weights";

/** Event indexes, keyed by the assistant entry they belong to. */
export interface TextClaims {
  thoughtsByEntry: Map<number, number[]>;
  responsesByEntry: Map<number, number[]>;
}

interface Window {
  /** The entry of the latest paired event before this one, or -1. */
  anchor: number;
  /** The entry of the next prompt or tool event paired with one, inclusive. */
  upper: number;
}

/**
 * Assigns each `afterAgentThought` and `afterAgentResponse` event to the
 * assistant message it describes, looking only between the entries of the
 * paired events around it, and records the assignment in `entryByEvent`.
 * Their order relative to tool events isn't reliable enough to align by.
 */
export const claimTextEvents = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
  matches: AnchorMatches,
): TextClaims => {
  const claims: TextClaims = {
    thoughtsByEntry: new Map(),
    responsesByEntry: new Map(),
  };
  const upperBounds = nextPairedEntries(
    events.length,
    matches,
    entries.length - 1,
  );
  let anchor = -1;
  events.forEach((event, eventIndex) => {
    const paired = matches.entryByEvent.get(eventIndex);
    if (paired !== undefined) {
      anchor = Math.max(anchor, paired);
      return;
    }
    if (event.kind !== "thought" && event.kind !== "response") {
      return;
    }
    const upper = upperBounds[eventIndex] ?? entries.length - 1;
    // Before any paired event (hooks installed mid-session), look no further
    // back than the turn the next paired event is in.
    const window = {
      anchor: anchor >= 0 ? anchor : lastUserEntryAtOrBefore(entries, upper),
      upper,
    };
    const target =
      event.kind === "thought"
        ? findThoughtEntry(entries, event.text, window, claims.thoughtsByEntry)
        : findResponseEntry(entries, event.text, window);
    if (target !== null) {
      const byEntry =
        event.kind === "thought"
          ? claims.thoughtsByEntry
          : claims.responsesByEntry;
      byEntry.set(target, [...(byEntry.get(target) ?? []), eventIndex]);
      matches.entryByEvent.set(eventIndex, target);
      anchor = Math.max(anchor, target);
    }
  });
  return claims;
};

/**
 * The message whose text contains the reasoning, else the next message
 * whose reasoning Cursor redacted in the transcript.
 */
const findThoughtEntry = (
  entries: CursorTranscriptEntry[],
  text: string,
  { anchor, upper }: Window,
  thoughtsByEntry: Map<number, number[]>,
): number | null => {
  const needle = normalizeText(text);
  if (needle.length === 0) {
    return null;
  }
  const candidates = assistantEntriesIn(entries, Math.max(anchor, 0), upper);
  const containing = candidates.find(([, entry]) =>
    normalizeText(`${entry.text} ${entry.reasoning ?? ""}`).includes(needle),
  );
  if (containing) {
    return containing[0];
  }
  const turnEnd = nextUserEntry(entries, Math.max(anchor, 0));
  const redacted = candidates.find(
    ([index, entry]) =>
      index > anchor &&
      index < turnEnd &&
      entry.reasoningRedacted &&
      !thoughtsByEntry.has(index),
  );
  return redacted?.[0] ?? null;
};

/**
 * The last message of the turn containing the response, else the turn's
 * last message if the transcript shows the turn finished. A turn the
 * transcript hasn't caught up with keeps the response as its own step.
 */
const findResponseEntry = (
  entries: CursorTranscriptEntry[],
  text: string,
  { anchor, upper }: Window,
): number | null => {
  const from = Math.max(anchor, 0);
  const turnEnd = nextUserEntry(entries, Math.max(anchor, 0));
  const candidates = assistantEntriesIn(
    entries,
    from,
    Math.min(upper, turnEnd - 1),
  );
  const needle = normalizeText(text);
  const containing = [...candidates]
    .reverse()
    .find(
      ([, entry]) =>
        needle.length > 0 && normalizeText(entry.text).includes(needle),
    );
  if (containing) {
    return containing[0];
  }
  const turnFinished =
    turnEnd < entries.length ||
    entries.slice(from, turnEnd).some((entry) => entry.kind === "turn_ended");
  return turnFinished ? (candidates.at(-1)?.[0] ?? null) : null;
};

const assistantEntriesIn = (
  entries: CursorTranscriptEntry[],
  from: number,
  to: number,
): Array<[number, CursorAssistantEntry]> => {
  const found: Array<[number, CursorAssistantEntry]> = [];
  for (let index = from; index <= to && index < entries.length; index++) {
    const entry = entries[index];
    if (entry?.kind === "assistant") {
      found.push([index, entry]);
    }
  }
  return found;
};

const lastUserEntryAtOrBefore = (
  entries: CursorTranscriptEntry[],
  index: number,
): number => {
  for (
    let candidate = Math.min(index, entries.length - 1);
    candidate >= 0;
    candidate--
  ) {
    if (entries[candidate]?.kind === "user") {
      return candidate;
    }
  }
  return -1;
};

const nextUserEntry = (
  entries: CursorTranscriptEntry[],
  after: number,
): number => {
  const index = entries.findIndex(
    (entry, i) => i > after && entry.kind === "user",
  );
  return index === -1 ? entries.length : index;
};

/** For each event, the entry of the next event already paired with one. */
const nextPairedEntries = (
  eventCount: number,
  matches: AnchorMatches,
  fallback: number,
): number[] => {
  const bounds = new Array<number>(eventCount).fill(fallback);
  let next = fallback;
  for (let index = eventCount - 1; index >= 0; index--) {
    bounds[index] = next;
    const paired = matches.entryByEvent.get(index);
    if (paired !== undefined) {
      next = paired;
    }
  }
  return bounds;
};
