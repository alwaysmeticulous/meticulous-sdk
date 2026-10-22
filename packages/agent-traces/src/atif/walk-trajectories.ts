import type { AtifTrajectory } from "../types/atif.types";

export interface IndexedAtifTrajectory {
  /** 0 is the root; subagents follow in depth-first order. */
  index: number;
  isSubagent: boolean;
  trajectory: AtifTrajectory;
}

/** Flattens a trajectory and its (possibly nested) embedded subagents. */
export const walkAtifTrajectories = (
  root: AtifTrajectory,
): IndexedAtifTrajectory[] => {
  const result: IndexedAtifTrajectory[] = [];
  const visit = (trajectory: AtifTrajectory, isSubagent: boolean): void => {
    result.push({ index: result.length, isSubagent, trajectory });
    for (const subagent of trajectory.subagent_trajectories ?? []) {
      visit(subagent, true);
    }
  };
  visit(root, false);
  return result;
};
