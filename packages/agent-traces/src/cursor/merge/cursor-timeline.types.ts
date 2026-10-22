import type {
  CursorHookEvent,
  CursorPromptEvent,
  CursorResponseEvent,
  CursorThoughtEvent,
  CursorToolEvent,
} from "../events/cursor-hook-event.types";
import type {
  CursorAssistantEntry,
  CursorTurnEndedEntry,
  CursorUserEntry,
} from "../transcript/cursor-transcript.types";

/** A transcript and its hook events merged into one ordered sequence. */
export type CursorTimelineItem =
  | CursorTimelinePrompt
  | CursorTimelineMessage
  | { kind: "turn_ended"; entry: CursorTurnEndedEntry }
  /** An event no transcript entry accounts for. */
  | { kind: "event"; event: CursorHookEvent };

export interface CursorTimelinePrompt {
  kind: "prompt";
  entry: CursorUserEntry;
  event: CursorPromptEvent | null;
}

export interface CursorTimelineMessage {
  kind: "message";
  entry: CursorAssistantEntry;
  /** Parallel to `entry.toolUses`. */
  toolEvents: Array<CursorToolEvent | null>;
  thoughts: CursorThoughtEvent[];
  responses: CursorResponseEvent[];
}
