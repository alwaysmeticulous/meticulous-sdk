import type {
  AtifSubagentTrajectoryRef,
  AtifTrajectory,
} from "../types/atif.types";

/**
 * Adds `ref` to the observation result for `toolCallId`, in whichever
 * trajectory issued that call, creating the result if the tool's own output
 * was never recorded. Returns false if no trajectory issued the call.
 */
export const linkSubagentToToolCall = (
  trajectories: AtifTrajectory[],
  toolCallId: string,
  ref: AtifSubagentTrajectoryRef,
): boolean => {
  const step = trajectories
    .flatMap((trajectory) => trajectory.steps)
    .find((candidate) =>
      candidate.tool_calls?.some((call) => call.tool_call_id === toolCallId),
    );
  if (!step) {
    return false;
  }
  step.observation ??= { results: [] };
  let result = step.observation.results.find(
    (candidate) => candidate.source_call_id === toolCallId,
  );
  if (!result) {
    result = { source_call_id: toolCallId };
    step.observation.results.push(result);
  }
  result.subagent_trajectory_ref = [
    ...(result.subagent_trajectory_ref ?? []),
    ref,
  ];
  return true;
};
