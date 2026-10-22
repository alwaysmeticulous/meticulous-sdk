import type { AtifTrajectory } from "../../types/atif.types";
import { describe, expect, it } from "vitest";
import {
  collectExcludedCallIds,
  stripAtifToolOutputs,
} from "../strip-atif-tool-outputs";
import {
  createToolOutputFilter,
  EXCLUDED_TOOL_OUTPUT,
} from "../tool-output-filter";

const trajectory: AtifTrajectory = {
  schema_version: "ATIF-v1.7",
  agent: { name: "a", version: "1" },
  steps: [
    {
      step_id: 1,
      source: "agent",
      message: "",
      tool_calls: [
        {
          tool_call_id: "c1",
          function_name: "mcp__crm__lookup",
          arguments: {},
        },
        {
          tool_call_id: "c2",
          function_name: "Shell",
          arguments: { command: "ls" },
          extra: { hook_tool_name: "MCP:crm" },
        },
        { tool_call_id: "c3", function_name: "Read", arguments: {} },
      ],
      observation: {
        results: [
          {
            source_call_id: "c1",
            content: "ACME CORP",
            extra: {
              is_error: false,
              truncated: true,
              original_length_chars: 9,
            },
          },
          { source_call_id: "c2", content: "ACME CORP" },
          { source_call_id: "c3", content: "kept" },
        ],
      },
    },
    {
      step_id: 2,
      source: "system",
      message: "",
      observation: {
        results: [
          { content: "ACME CORP", extra: { orphan_tool_use_id: "c1" } },
          { content: "ACME CORP", extra: { tool_name: "mcp__crm__lookup" } },
        ],
      },
    },
  ],
  subagent_trajectories: [
    {
      schema_version: "ATIF-v1.7",
      trajectory_id: "sub",
      agent: { name: "a", version: "1" },
      steps: [
        {
          step_id: 1,
          source: "agent",
          message: "",
          tool_calls: [
            {
              tool_call_id: "s1",
              function_name: "mcp__crm__search",
              arguments: { q: "acme" },
            },
          ],
          observation: {
            results: [{ source_call_id: "s1", content: "ACME CORP" }],
          },
        },
      ],
    },
  ],
};

describe("stripAtifToolOutputs", () => {
  it("replaces every result of an excluded call, keeping the calls", () => {
    const regexes = [/^mcp__crm__/, /^MCP:crm$/];
    const callIds = collectExcludedCallIds(trajectory, regexes);
    expect([...callIds].sort()).toEqual(["c1", "c2", "s1"]);

    const stripped = stripAtifToolOutputs(
      trajectory,
      createToolOutputFilter(regexes, callIds),
    );

    const json = JSON.stringify(stripped);
    expect(json).not.toContain("ACME CORP");
    expect(json).toContain('"q":"acme"');
    expect(stripped.steps[0]?.tool_calls).toEqual(
      trajectory.steps[0]?.tool_calls,
    );
    expect(stripped.steps[0]?.observation?.results).toEqual([
      {
        source_call_id: "c1",
        content: EXCLUDED_TOOL_OUTPUT,
        extra: { is_error: false, tool_output_excluded: true },
      },
      {
        source_call_id: "c2",
        content: EXCLUDED_TOOL_OUTPUT,
        extra: { tool_output_excluded: true },
      },
      { source_call_id: "c3", content: "kept" },
    ]);
    expect(trajectory.steps[0]?.observation?.results[0]?.content).toBe(
      "ACME CORP",
    );
  });
});
