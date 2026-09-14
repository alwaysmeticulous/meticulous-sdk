import { describe, expect, it } from "vitest";
import { assertScopeCoherent } from "./js-coverage-diff.command";

const baseOptions = (
  overrides: Partial<Parameters<typeof assertScopeCoherent>[0]> = {},
): Parameters<typeof assertScopeCoherent>[0] => ({
  apiToken: undefined,
  replayDiffId: undefined,
  screenshotName: undefined,
  testRunId: undefined,
  commitSha: undefined,
  project: undefined,
  globFilter: undefined,
  summary: false,
  limit: undefined,
  offset: undefined,
  dontWaitForTestRunToComplete: false,
  json: false,
  ...overrides,
});

describe("js-coverage-diff scope validation", () => {
  it("accepts a replay diff on its own", () => {
    expect(() =>
      assertScopeCoherent(baseOptions({ replayDiffId: "rd-1" })),
    ).not.toThrow();
  });

  it("accepts a replay diff with a screenshot and a glob", () => {
    expect(() =>
      assertScopeCoherent(
        baseOptions({
          replayDiffId: "rd-1",
          screenshotName: "shot",
          globFilter: ["src/**"],
        }),
      ),
    ).not.toThrow();
  });

  // The whole-run scope has no flag of its own: a bare invocation diffs the
  // current checkout's run against its own base.
  it("accepts a bare invocation", () => {
    expect(() => assertScopeCoherent(baseOptions())).not.toThrow();
  });

  it("accepts an explicit run, a commit, and --summary", () => {
    expect(() =>
      assertScopeCoherent(baseOptions({ testRunId: "tr-1", summary: true })),
    ).not.toThrow();
    expect(() =>
      assertScopeCoherent(baseOptions({ commitSha: "abc123" })),
    ).not.toThrow();
  });

  it("rejects naming the run twice", () => {
    expect(() =>
      assertScopeCoherent(
        baseOptions({ testRunId: "tr-1", commitSha: "abc123" }),
      ),
    ).toThrow(/Pass either --testRunId or --commitSha, not both/);
  });

  it("rejects the whole-run options alongside a replay diff", () => {
    expect(() =>
      assertScopeCoherent(
        baseOptions({
          replayDiffId: "rd-1",
          testRunId: "tr-1",
          summary: true,
        }),
      ),
    ).toThrow(/--testRunId, --summary only apply to a whole-test-run diff/);
  });

  it("rejects a screenshot without a replay diff", () => {
    expect(() =>
      assertScopeCoherent(baseOptions({ screenshotName: "shot" })),
    ).toThrow(/--screenshotName only applies to --replayDiffId/);
  });
});

describe("js-coverage-diff paging validation", () => {
  it("accepts paging on a whole-test-run diff", () => {
    expect(() =>
      assertScopeCoherent(baseOptions({ limit: 50, offset: 100 })),
    ).not.toThrow();
  });

  // Both scopes page: the replay-diff route gained it behind a clientVersion
  // gate, since unlike the whole-run one it has published unpaged callers.
  it("accepts paging on a replay diff too", () => {
    expect(() =>
      assertScopeCoherent(
        baseOptions({ replayDiffId: "rd-1", limit: 50, offset: 10 }),
      ),
    ).not.toThrow();
  });

  // The summary is one row of totals: paging it would be silently ignored.
  it("rejects paging alongside --summary", () => {
    expect(() =>
      assertScopeCoherent(
        baseOptions({ summary: true, limit: 10, offset: 20 }),
      ),
    ).toThrow(/--summary cannot be combined with: --limit, --offset/);
  });

  it("still accepts --summary on its own", () => {
    expect(() =>
      assertScopeCoherent(baseOptions({ summary: true })),
    ).not.toThrow();
  });
});
