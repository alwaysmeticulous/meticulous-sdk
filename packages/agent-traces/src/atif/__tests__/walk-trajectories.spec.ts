import { describe, expect, it } from "vitest";
import type { AtifTrajectory } from "../../types/atif.types";
import { walkAtifTrajectories } from "../walk-trajectories";

const trajectory = (
  id: string,
  subagents: AtifTrajectory[] = [],
): AtifTrajectory => ({
  schema_version: "ATIF-v1.7",
  trajectory_id: id,
  agent: { name: "test", version: "1" },
  steps: [],
  subagent_trajectories: subagents,
});

describe("walkAtifTrajectories", () => {
  it("indexes the root first, then nested subagents depth first", () => {
    const walked = walkAtifTrajectories(
      trajectory("root", [
        trajectory("a", [trajectory("a1")]),
        trajectory("b"),
      ]),
    );
    expect(
      walked.map(({ index, isSubagent, trajectory }) => [
        index,
        isSubagent,
        trajectory.trajectory_id,
      ]),
    ).toEqual([
      [0, false, "root"],
      [1, true, "a"],
      [2, true, "a1"],
      [3, true, "b"],
    ]);
  });
});
