import type {
  AtifObservationResult,
  AtifStep,
  AtifTrajectory,
} from "../types/atif.types";
import { asNonEmptyString } from "../utils/json-guards";
import type { ToolOutputFilter } from "./tool-output-filter";
import { EXCLUDED_TOOL_OUTPUT, matchesAny } from "./tool-output-filter";

const ORPHAN_CALL_ID_KEYS = ["orphan_tool_use_id", "orphan_tool_call_id"];
const DROPPED_RESULT_EXTRA_KEYS = new Set([
  "truncated",
  "original_length_chars",
  "image_count",
  "attachment_count",
]);

export const collectExcludedCallIds = (
  trajectory: AtifTrajectory,
  regexes: RegExp[],
): Set<string> => {
  const callIds = new Set<string>();
  for (const step of allSteps(trajectory)) {
    for (const call of step.tool_calls ?? []) {
      const names = [
        call.function_name,
        asNonEmptyString(call.extra?.["hook_tool_name"]),
      ];
      if (names.some((name) => !!name && matchesAny(regexes, name))) {
        callIds.add(call.tool_call_id);
      }
    }
  }
  return callIds;
};

export const stripAtifToolOutputs = (
  trajectory: AtifTrajectory,
  filter: ToolOutputFilter,
): AtifTrajectory => ({
  ...trajectory,
  steps: trajectory.steps.map((step) => stripStep(step, filter)),
  ...(trajectory.subagent_trajectories
    ? {
        subagent_trajectories: trajectory.subagent_trajectories.map(
          (subagent) => stripAtifToolOutputs(subagent, filter),
        ),
      }
    : {}),
});

const stripStep = (step: AtifStep, filter: ToolOutputFilter): AtifStep =>
  step.observation
    ? {
        ...step,
        observation: {
          ...step.observation,
          results: step.observation.results.map((result) =>
            stripResult(result, filter),
          ),
        },
      }
    : step;

const stripResult = (
  result: AtifObservationResult,
  filter: ToolOutputFilter,
): AtifObservationResult => {
  const extra = result.extra ?? {};
  const callId =
    result.source_call_id ??
    ORPHAN_CALL_ID_KEYS.map((key) => asNonEmptyString(extra[key])).find(
      (id) => id !== null,
    ) ??
    null;
  if (
    !filter.isExcluded({
      callId,
      names: [asNonEmptyString(extra["tool_name"])],
    })
  ) {
    return result;
  }
  return {
    ...result,
    content: EXCLUDED_TOOL_OUTPUT,
    extra: {
      ...Object.fromEntries(
        Object.entries(extra).filter(
          ([key]) => !DROPPED_RESULT_EXTRA_KEYS.has(key),
        ),
      ),
      tool_output_excluded: true,
    },
  };
};

const allSteps = (trajectory: AtifTrajectory): AtifStep[] => [
  ...trajectory.steps,
  ...(trajectory.subagent_trajectories ?? []).flatMap(allSteps),
];
