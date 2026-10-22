import type { CursorHookEvent } from "../events/cursor-hook-event.types";
import type { CursorTranscriptEntry } from "../transcript/cursor-transcript.types";
import { alignSequences } from "./align-sequences";
import { promptsMatch, toolMatchWeight } from "./match-weights";

/** Hook events paired with the transcript entries they describe. */
export interface AnchorMatches {
  /** The entry each paired event belongs to. */
  entryByEvent: Map<number, number>;
  promptEventByEntry: Map<number, number>;
  /** Keyed by `toolUseKey`. */
  toolEventByUse: Map<string, number>;
}

interface ToolUseRef {
  entryIndex: number;
  useIndex: number;
  name: string;
}

export const toolUseKey = (entryIndex: number, useIndex: number): string =>
  `${entryIndex}:${useIndex}`;

/**
 * Pairs prompts with `beforeSubmitPrompt` events by their text, then, between
 * consecutive paired prompts, tool calls with `postToolUse(Failure)` events
 * by order and name. Transcript tool calls carry no ids to match on.
 */
export const alignAnchors = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
): AnchorMatches => {
  const matches: AnchorMatches = {
    entryByEvent: new Map(),
    promptEventByEntry: new Map(),
    toolEventByUse: new Map(),
  };
  const promptPairs = alignPrompts(entries, events);
  for (const [entryIndex, eventIndex] of promptPairs) {
    matches.promptEventByEntry.set(entryIndex, eventIndex);
    matches.entryByEvent.set(eventIndex, entryIndex);
  }
  const entryBounds = [
    0,
    ...promptPairs.map(([entry]) => entry),
    entries.length,
  ];
  const eventBounds = [
    0,
    ...promptPairs.map(([, event]) => event),
    events.length,
  ];
  for (let segment = 0; segment < entryBounds.length - 1; segment++) {
    alignSegmentTools(
      entries,
      events,
      [entryBounds[segment] ?? 0, entryBounds[segment + 1] ?? 0],
      [eventBounds[segment] ?? 0, eventBounds[segment + 1] ?? 0],
      matches,
    );
  }
  return matches;
};

const alignPrompts = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
): Array<[number, number]> => {
  const userEntries = indexesWhere(entries, (entry) => entry.kind === "user");
  const promptEvents = indexesWhere(events, (event) => event.kind === "prompt");
  const pairs = alignSequences(
    userEntries,
    promptEvents,
    (entryIndex, eventIndex) => {
      const entry = entries[entryIndex];
      const event = events[eventIndex];
      return entry?.kind === "user" &&
        event?.kind === "prompt" &&
        promptsMatch(entry.text, event.prompt)
        ? 1
        : 0;
    },
  );
  return pairs.map(([a, b]) => [userEntries[a] ?? 0, promptEvents[b] ?? 0]);
};

const alignSegmentTools = (
  entries: CursorTranscriptEntry[],
  events: CursorHookEvent[],
  [entryStart, entryEnd]: [number, number],
  [eventStart, eventEnd]: [number, number],
  matches: AnchorMatches,
): void => {
  const uses: ToolUseRef[] = [];
  for (let entryIndex = entryStart; entryIndex < entryEnd; entryIndex++) {
    const entry = entries[entryIndex];
    if (entry?.kind === "assistant") {
      entry.toolUses.forEach((use, useIndex) =>
        uses.push({ entryIndex, useIndex, name: use.name }),
      );
    }
  }
  const toolEvents: Array<{ eventIndex: number; name: string }> = [];
  for (let eventIndex = eventStart; eventIndex < eventEnd; eventIndex++) {
    const event = events[eventIndex];
    if (event?.kind === "tool") {
      toolEvents.push({ eventIndex, name: event.toolName });
    }
  }
  for (const [a, b] of alignSequences(uses, toolEvents, (use, event) =>
    toolMatchWeight(use.name, event.name),
  )) {
    const use = uses[a];
    const event = toolEvents[b];
    if (use && event) {
      matches.toolEventByUse.set(
        toolUseKey(use.entryIndex, use.useIndex),
        event.eventIndex,
      );
      matches.entryByEvent.set(event.eventIndex, use.entryIndex);
    }
  }
};

const indexesWhere = <T>(
  items: T[],
  predicate: (item: T) => boolean,
): number[] => items.flatMap((item, index) => (predicate(item) ? [index] : []));
