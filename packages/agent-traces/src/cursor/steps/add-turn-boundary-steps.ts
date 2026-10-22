import type { CursorPromptEvent } from "../events/cursor-hook-event.types";
import type {
  CursorTurnEndedEntry,
  CursorUserEntry,
} from "../transcript/cursor-transcript.types";
import type { CursorStepContext } from "./cursor-step-context";
import { finishTurn, noteModel } from "./cursor-step-context";

/** The prompt as typed comes from the hook; the transcript's is a fallback. */
export const addPromptStep = (
  context: CursorStepContext,
  entry: CursorUserEntry | null,
  event: CursorPromptEvent | null,
): void => {
  context.openStep = null;
  finishTurn(context);
  noteModel(context, event?.model ?? null);
  const timestamp = event?.timestamp ?? entry?.timestamp ?? null;
  context.steps.push({
    step_id: 0,
    ...(timestamp ? { timestamp } : {}),
    source: "user",
    message: event?.prompt ?? entry?.text ?? "",
    extra: {
      ...(event?.generationId ? { generation_id: event.generationId } : {}),
      ...(event?.composerMode ? { composer_mode: event.composerMode } : {}),
      ...(event && event.attachments.length > 0
        ? { attachments: event.attachments }
        : {}),
    },
  });
};

/** Records the transcript's turn outcome on the turn's last agent step. */
export const addTurnEnded = (
  context: CursorStepContext,
  entry: CursorTurnEndedEntry,
): void => {
  context.openStep = null;
  const outcome = {
    ...(entry.status ? { turn_status: entry.status } : {}),
    ...(entry.error ? { turn_error: entry.error } : {}),
  };
  const last = context.turn.agentSteps.at(-1);
  if (last) {
    last.extra = { ...last.extra, ...outcome };
  } else if (entry.error) {
    // e.g. a usage limit hit before the model replied.
    context.steps.push({
      step_id: 0,
      source: "system",
      message: `Turn ended with ${entry.status ?? "an error"}: ${entry.error}`,
      extra: outcome,
    });
  }
};
