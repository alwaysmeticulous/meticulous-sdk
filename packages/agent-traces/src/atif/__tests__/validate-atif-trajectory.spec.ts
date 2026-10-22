import { describe, expect, it } from "vitest";
import { validateAtifTrajectory } from "../validate-atif-trajectory";

const VALID = {
  schema_version: "ATIF-v1.6",
  agent: { name: "harness", version: "1" },
  steps: [{ step_id: 1, source: "user", message: "hi" }],
};

describe("validateAtifTrajectory", () => {
  it("accepts a minimal trajectory, including embedded subagents", () => {
    expect(validateAtifTrajectory(VALID).error).toBeNull();
    expect(
      validateAtifTrajectory({ ...VALID, subagent_trajectories: [VALID] })
        .error,
    ).toBeNull();
  });

  it.each([
    [
      { ...VALID, schema_version: "1.6" },
      'schema_version must be a string starting "ATIF-"',
    ],
    [{ ...VALID, agent: {} }, "agent.name must be a non-empty string"],
    [{ ...VALID, steps: {} }, "steps must be an array"],
    [
      { ...VALID, steps: [{ source: "user", message: "" }] },
      "steps[0].step_id must be a number",
    ],
    [
      { ...VALID, steps: [{ step_id: 1, source: "user" }] },
      "steps[0].message must be a string or an array",
    ],
    [
      {
        ...VALID,
        steps: [{ step_id: 1, source: "agent", message: "", tool_calls: [{}] }],
      },
      "steps[0].tool_calls must be an array of calls with a tool_call_id and function_name",
    ],
    [
      {
        ...VALID,
        steps: [{ step_id: 1, source: "agent", message: "", observation: {} }],
      },
      "steps[0].observation.results must be an array of objects",
    ],
    [
      { ...VALID, subagent_trajectories: [{ ...VALID, steps: null }] },
      "subagent_trajectories[0].steps must be an array",
    ],
  ])("rejects %j", (value, error) => {
    expect(validateAtifTrajectory(value).error).toBe(error);
  });
});
