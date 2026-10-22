import type { AtifStep } from "../../types/atif.types";
import type { CursorHookEventBase } from "../events/cursor-hook-event.types";

export interface CursorStepContext {
  steps: AtifStep[];
  /** An agent step rebuilt from a thought event, still collecting the tool calls that follow it. */
  openStep: AtifStep | null;
  turn: TurnState;
  toolCallCount: number;
}

interface TurnState {
  agentSteps: AtifStep[];
  /** The latest model any of the turn's events named. */
  model: string | null;
  /** Steps holding an `afterAgentResponse`'s usage, which a `stop`'s supersedes. */
  responseUsageSteps: AtifStep[];
}

export const createStepContext = (): CursorStepContext => ({
  steps: [],
  openStep: null,
  turn: emptyTurn(),
  toolCallCount: 0,
});

/** Gives the finished turn's transcript-only steps the model its events named. */
export const finishTurn = (context: CursorStepContext): void => {
  const { model, agentSteps } = context.turn;
  for (const step of agentSteps) {
    if (model && !step.model_name) {
      step.model_name = model;
    }
  }
  context.turn = emptyTurn();
};

export const pushAgentStep = (
  context: CursorStepContext,
  step: AtifStep,
): void => {
  context.steps.push(step);
  context.turn.agentSteps.push(step);
};

export const noteModel = (
  context: CursorStepContext,
  model: string | null,
): void => {
  if (model) {
    context.turn.model = model;
  }
};

export const nextToolCallId = (context: CursorStepContext): string =>
  `call_${++context.toolCallCount}`;

export const newEventAgentStep = (event: CursorHookEventBase): AtifStep => ({
  step_id: 0,
  timestamp: event.timestamp,
  source: "agent",
  ...(event.model ? { model_name: event.model } : {}),
  message: "",
  extra: event.generationId ? { generation_id: event.generationId } : {},
});

const emptyTurn = (): TurnState => ({
  agentSteps: [],
  model: null,
  responseUsageSteps: [],
});
