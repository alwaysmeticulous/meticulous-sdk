import type { AgentTraceToolCallCount } from "../types/summary.types";
import type { AtifTrajectory } from "../types/atif.types";

export interface ActivityStats {
  userPromptCount: number;
  compactionCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  /** Most used first. */
  toolCallCounts: AgentTraceToolCallCount[];
}

/**
 * Prompts and compactions are counted on the root trajectory only, since a
 * subagent's "user" steps are its instructions from the parent agent. Tool
 * use is counted across every trajectory.
 */
export const computeActivityStats = (
  root: AtifTrajectory,
  allTrajectories: AtifTrajectory[],
): ActivityStats => {
  const userSteps = root.steps.filter((step) => step.source === "user");
  const compactions = userSteps.filter(
    (step) => step.extra?.["is_compact_summary"] === true,
  );
  // Steps with an origin (e.g. a background task notification) were injected
  // by the agent rather than typed by the user.
  const prompts = userSteps.filter(
    (step) =>
      step.extra?.["is_compact_summary"] !== true &&
      step.extra?.["origin_kind"] === undefined,
  );

  const toolCallCounts = new Map<string, number>();
  let toolErrorCount = 0;
  for (const step of allTrajectories.flatMap((t) => t.steps)) {
    for (const call of step.tool_calls ?? []) {
      toolCallCounts.set(
        call.function_name,
        (toolCallCounts.get(call.function_name) ?? 0) + 1,
      );
    }
    for (const result of step.observation?.results ?? []) {
      if (result.extra?.["is_error"] === true) {
        toolErrorCount++;
      }
    }
  }

  return {
    userPromptCount: prompts.length,
    compactionCount: compactions.length,
    toolCallCount: [...toolCallCounts.values()].reduce((a, b) => a + b, 0),
    toolErrorCount,
    toolCallCounts: [...toolCallCounts.entries()]
      .map(([toolName, count]) => ({ toolName, count }))
      .sort(
        (a, b) => b.count - a.count || a.toolName.localeCompare(b.toolName),
      ),
  };
};
