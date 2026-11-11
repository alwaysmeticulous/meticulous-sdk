import { describe, expect, it } from "vitest";
import type { CandidatePr } from "../candidate-prs/types";
import { aggregateResults } from "../results/aggregate-results";
import type { SwarmRunSummary, TestRunSummary } from "../results/types";

const candidate = (
  prNumber: number,
  overrides: Partial<CandidatePr> = {},
): CandidatePr => ({
  prNumber,
  title: `PR ${prNumber}`,
  kind: "squash",
  baseSha: `base${prNumber}`,
  headSha: `head${prNumber}`,
  mergedAt: "2026-10-01T00:00:00.000Z",
  author: "Dev",
  frontendFiles: ["src/A.tsx"],
  frontendLinesChanged: 50,
  totalFilesChanged: 1,
  signals: {
    revertedBy: null,
    followUpFixes: [],
    refactor: false,
    dependencyUpgrade: false,
  },
  score: 30,
  reasons: [],
  ...overrides,
});

const testRun = (
  id: string,
  commitSha: string,
  status = "Success",
  diffCount: number | null = 0,
): TestRunSummary => ({
  id,
  commitSha,
  status,
  diffCount,
  url: `https://app/test-runs/${id}`,
});

const swarmRun = (
  id: string,
  commitSha: string,
  overrides: Partial<SwarmRunSummary> = {},
): SwarmRunSummary => ({
  id,
  commitSha,
  status: "succeeded",
  counts: { total: 3, pass: 3, fail: 0 },
  failingCases: [],
  url: `https://app/swarm/${id}`,
  ...overrides,
});

describe("aggregateResults", () => {
  it("joins runs to PRs by recorded id, falling back to commit, most compelling first", () => {
    const results = aggregateResults({
      projectUrl: "https://app/projects/o/p",
      backtests: [
        {
          prNumber: 1,
          baseSha: "base1",
          headSha: "head1",
          headTestRunId: "tr-h1-old",
          swarmRunId: null,
        },
      ],
      candidates: [
        candidate(1),
        candidate(2, {
          signals: {
            revertedBy: { sha: "r", subject: 'Revert "PR 2"', daysAfter: 3 },
            followUpFixes: [],
            refactor: false,
            dependencyUpgrade: false,
          },
        }),
      ],
      testRuns: [
        testRun("tr-h1-new", "head1", "Success", 9),
        testRun("tr-h1-old", "head1", "Failure", 2),
        testRun("tr-h2", "head2", "Failure", 1),
        testRun("tr-b2", "base2"),
        testRun("tr-unrelated", "other"),
      ],
      swarmRuns: [
        swarmRun("s2", "head2", {
          counts: { total: 3, pass: 2, fail: 1 },
          failingCases: [
            {
              caseIndex: 1,
              title: "Date picker",
              summary: "Cannot select a date",
              regressionCount: 1,
            },
          ],
        }),
      ],
    });

    expect(results.prs.map((pr) => pr.prNumber)).toEqual([2, 1]);
    expect(results.prs[0]).toMatchObject({
      headTestRun: { id: "tr-h2" },
      baseTestRun: { id: "tr-b2" },
      swarmRun: { id: "s2" },
      bugSignals: ['reverted 3d later: Revert "PR 2"'],
      pending: false,
      runUrl: "https://app/test-runs/tr-h2",
      failingCases: [
        {
          caseIndex: 1,
          title: "Date picker",
          url: "https://app/test-runs/tr-h2?tab=agent-swarm&case=case-1",
        },
      ],
    });
    expect(results.prs[1].headTestRun?.id).toBe("tr-h1-old");
    expect(results.otherTestRuns.map((run) => run.id)).toEqual([
      "tr-h1-new",
      "tr-unrelated",
    ]);
    expect(results.allDone).toBe(true);
  });

  it("links a swarm run without a head test run to its own page", () => {
    const results = aggregateResults({
      projectUrl: null,
      backtests: [{ prNumber: 3, baseSha: "b3", headSha: "h3" }],
      candidates: [],
      testRuns: [],
      swarmRuns: [
        swarmRun("s3", "h3", {
          failingCases: [
            {
              caseIndex: 0,
              title: "Checkout",
              summary: null,
              regressionCount: 0,
            },
          ],
        }),
      ],
    });

    expect(results.prs[0]).toMatchObject({
      runUrl: "https://app/swarm/s3",
      failingCases: [{ url: "https://app/swarm/s3?case=case-0" }],
    });
  });

  it("marks PRs pending while runs are in progress or not yet listed", () => {
    const results = aggregateResults({
      projectUrl: null,
      backtests: [
        { prNumber: 1, baseSha: "b1", headSha: "h1" },
        { prNumber: 2, baseSha: "b2", headSha: "h2", swarmRunId: "s-missing" },
      ],
      candidates: [],
      testRuns: [testRun("t1", "h1", "Running", null), testRun("t2", "h2")],
      swarmRuns: [],
    });
    expect(results.prs.every((pr) => pr.pending)).toBe(true);
    expect(results.allDone).toBe(false);
  });

  it("is not done while a backtester has written its record but triggered nothing yet", () => {
    const results = aggregateResults({
      projectUrl: null,
      backtests: [{ prNumber: 1, baseSha: "b1", headSha: "h1" }],
      candidates: [candidate(9)],
      testRuns: [],
      swarmRuns: [],
    });
    expect(results.prs.map((pr) => [pr.prNumber, pr.pending])).toEqual([
      [1, true],
    ]);
    expect(results.allDone).toBe(false);
  });

  it("keeps PRs whose backtest failed so the error is reported, and drops candidates with no runs", () => {
    const results = aggregateResults({
      projectUrl: null,
      backtests: [
        { prNumber: 1, baseSha: "b1", headSha: "h1", errors: ["build failed"] },
      ],
      candidates: [candidate(9)],
      testRuns: [],
      swarmRuns: [],
    });
    expect(results.prs.map((pr) => [pr.prNumber, pr.errors])).toEqual([
      [1, ["build failed"]],
    ]);
  });
});
