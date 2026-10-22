import type { AtifTrajectory } from "../../types/atif.types";
import { describe, expect, it } from "vitest";
import { statsFromAtif } from "../stats-from-atif";

const subagent: AtifTrajectory = {
  schema_version: "ATIF-v1.7",
  agent: { name: "harness", version: "1" },
  steps: [
    {
      step_id: 1,
      timestamp: "2026-10-01T09:00:09.000Z",
      source: "agent",
      model_name: "small",
      message: "",
      metrics: { prompt_tokens: 5, completion_tokens: 1 },
    },
  ],
};

const root: AtifTrajectory = {
  schema_version: "ATIF-v1.7",
  agent: { name: "harness", version: "" },
  steps: [
    {
      step_id: 1,
      timestamp: "2026-10-01T09:00:01.000Z",
      source: "user",
      message: [{ type: "text", text: "\n  Tidy the repo\nplease" }],
    },
    {
      step_id: 2,
      source: "agent",
      model_name: "big",
      message: "",
      metrics: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 4 },
    },
  ],
  subagent_trajectories: [subagent],
};

describe("statsFromAtif", () => {
  it("sums every trajectory's steps when there are no final metrics", () => {
    expect(statsFromAtif(root)).toMatchObject({
      agentVersion: null,
      title: "Tidy the repo",
      models: ["big", "small"],
      startedAt: "2026-10-01T09:00:01.000Z",
      endedAt: "2026-10-01T09:00:09.000Z",
      stepCount: 2,
      subagentCount: 1,
      totals: { promptTokens: 15, completionTokens: 3, cachedTokens: 4 },
      reportedCostUsd: null,
    });
  });

  it("prefers the final metrics it has", () => {
    const stats = statsFromAtif({
      ...root,
      final_metrics: {
        total_prompt_tokens: 100,
        total_cost_usd: 0.5,
        extra: { total_cache_creation_tokens: 7 },
      },
    });
    expect(stats.totals).toEqual({
      promptTokens: 100,
      completionTokens: 3,
      cachedTokens: 4,
      cacheCreationTokens: 7,
    });
    expect(stats.reportedCostUsd).toBe(0.5);
  });
});
