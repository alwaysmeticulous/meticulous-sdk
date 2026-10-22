import { describe, expect, it } from "vitest";
import { getAtifStepTokens } from "../step-token-breakdown";

describe("getAtifStepTokens", () => {
  it("splits prompt tokens into uncached input, cache reads and cache writes", () => {
    expect(
      getAtifStepTokens({
        prompt_tokens: 1_000,
        completion_tokens: 50,
        cached_tokens: 700,
        extra: { cache_creation_input_tokens: 200 },
      }),
    ).toEqual({ input: 100, output: 50, cacheRead: 700, cacheWrite: 200 });
  });

  it("treats missing metrics as zero", () => {
    expect(getAtifStepTokens(undefined)).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(getAtifStepTokens({ prompt_tokens: 10 })).toEqual({
      input: 10,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("never reports negative input when a harness under-counts prompt tokens", () => {
    expect(
      getAtifStepTokens({ prompt_tokens: 5, cached_tokens: 10 }).input,
    ).toBe(0);
  });
});
