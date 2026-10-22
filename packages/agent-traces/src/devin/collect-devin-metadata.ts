import { titleFromPrompt } from "../atif/title-from-prompt";
import { asNonEmptyString, asString } from "../utils/json-guards";
import type { TimedSpooledEvent } from "../hook-events/spooled-event.types";

export interface DevinSessionMetadata {
  cwd: string | null;
  /** The first line of the first prompt. */
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** `source` of `SessionStart`, e.g. how the session was started. */
  startSource: string | null;
  /** `reason` of `SessionEnd`. */
  endReason: string | null;
  malformedEventCount: number;
}

export const collectDevinMetadata = (
  events: TimedSpooledEvent[],
): DevinSessionMetadata => {
  const metadata: DevinSessionMetadata = {
    cwd: null,
    title: null,
    startedAt: events[0]?.timestamp ?? null,
    endedAt: events.at(-1)?.timestamp ?? null,
    startSource: null,
    endReason: null,
    malformedEventCount: 0,
  };
  for (const { event } of events) {
    if (!event?.payload) {
      metadata.malformedEventCount++;
      continue;
    }
    const { payload } = event;
    metadata.cwd ??= event.projectDir ?? event.cwd;
    switch (asNonEmptyString(payload["hook_event_name"]) ?? event.event) {
      case "UserPromptSubmit":
        metadata.title ??= titleFromPrompt(asString(payload["prompt"]));
        break;
      case "SessionStart":
        metadata.startSource ??= asNonEmptyString(payload["source"]);
        break;
      case "SessionEnd":
        metadata.endReason = asNonEmptyString(payload["reason"]);
        break;
    }
  }
  return metadata;
};
