import type { AtifToolCall, AtifTrajectory } from "../../types/atif.types";
import { linkSubagentToToolCall } from "../../atif/link-subagent";
import { canonicalToolName, normalizeText } from "../merge/match-weights";
import type { ConvertedCursorSubagent } from "./convert-cursor-subagents";

/**
 * Links each subagent to the tool call that spawned it: by the id hook
 * events gave, else by the first unlinked `Task` call whose arguments carry
 * the subagent's prompt. Unlinked subagents still appear, flat.
 */
export const linkCursorSubagents = (
  sessionId: string,
  root: AtifTrajectory,
  subagents: ConvertedCursorSubagent[],
): void => {
  const all = [root, ...subagents.map(({ converted }) => converted.trajectory)];
  const linked = new Set<string>();
  for (const { trajectoryId, parentToolCallId, task, converted } of subagents) {
    const trajectory = converted.trajectory;
    const ref = {
      trajectory_id: trajectoryId,
      session_id: sessionId,
      extra: {
        subagent_type: trajectory.extra?.["subagent_type"] ?? null,
        description: trajectory.extra?.["description"] ?? null,
      },
    };
    let callId =
      parentToolCallId && linkSubagentToToolCall(all, parentToolCallId, ref)
        ? parentToolCallId
        : null;
    if (!callId) {
      callId = findTaskCall(all, task, linked);
      if (callId) {
        linkSubagentToToolCall(all, callId, ref);
      }
    }
    if (callId) {
      linked.add(callId);
    }
    trajectory.extra = { ...trajectory.extra, parent_tool_use_id: callId };
  }
};

const findTaskCall = (
  trajectories: AtifTrajectory[],
  task: string | null,
  linked: Set<string>,
): string | null => {
  const needle = normalizeText(task ?? "");
  if (needle.length === 0) {
    return null;
  }
  const call = trajectories
    .flatMap((trajectory) => trajectory.steps)
    .flatMap((step) => step.tool_calls ?? [])
    .find(
      (candidate) =>
        !linked.has(candidate.tool_call_id) &&
        canonicalToolName(candidate.function_name) === "task" &&
        stringArguments(candidate).some(
          (value) => normalizeText(value) === needle,
        ),
    );
  return call?.tool_call_id ?? null;
};

const stringArguments = (call: AtifToolCall): string[] =>
  Object.values(call.arguments).filter(
    (value): value is string => typeof value === "string",
  );
