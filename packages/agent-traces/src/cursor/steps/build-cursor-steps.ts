import type { AtifStep } from "../../types/atif.types";
import { assertNever } from "../../utils/assert-never";
import type { CursorTimelineItem } from "../merge/cursor-timeline.types";
import { addEventStep } from "./add-event-step";
import { addMessageStep } from "./add-message-step";
import { addPromptStep, addTurnEnded } from "./add-turn-boundary-steps";
import { createStepContext, finishTurn } from "./cursor-step-context";

export const buildCursorSteps = (
  timeline: CursorTimelineItem[],
): AtifStep[] => {
  const context = createStepContext();
  for (const item of timeline) {
    switch (item.kind) {
      case "prompt":
        addPromptStep(context, item.entry, item.event);
        break;
      case "message":
        addMessageStep(context, item);
        break;
      case "turn_ended":
        addTurnEnded(context, item.entry);
        break;
      case "event":
        addEventStep(context, item.event);
        break;
      default:
        assertNever(item);
    }
  }
  finishTurn(context);
  context.steps.forEach((step, index) => {
    step.step_id = index + 1;
  });
  return context.steps;
};
