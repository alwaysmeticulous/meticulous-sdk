import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  getAgentSwarmRun,
  getAgentSwarmRuns,
  getTestRun,
  getTestRunDiffsSummaryCounts,
  getTestRuns,
  isAgentSwarmRunProcessingResponse,
  isTestRunProcessingResponse,
  type AgentSwarmRunListItem,
  type MeticulousClient,
  type TestRunListItem,
} from "@alwaysmeticulous/client";
import { METICULOUS_APP_URL } from "../../onboard/build-context";
import type { CandidatePrsResult } from "../candidate-prs/find-candidate-prs";
import { readWorkspaceJson } from "../shared/helper-options";
import type { TryContextJson } from "../shared/try-context";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import { aggregateResults } from "./aggregate-results";
import type {
  BacktestRecord,
  SwarmFailingCase,
  SwarmRunSummary,
  TestRunSummary,
  TryResults,
} from "./types";

const TEST_RUNS_PAGE = 100;
const SWARM_RUNS_PAGE_WITH_COUNTS = 25;

export const fetchTryResults = async (options: {
  client: MeticulousClient;
  repoRoot: string;
  context: TryContextJson | null;
}): Promise<TryResults> => {
  const { client, repoRoot, context } = options;
  const projectPath = context
    ? `${METICULOUS_APP_URL}/projects/${encodeURIComponent(context.organization.name)}/${encodeURIComponent(context.project.name)}`
    : null;

  const backtests = readBacktestRecords(repoRoot);
  const [listedTestRuns, swarmRuns] = await Promise.all([
    fetchTestRuns(client, projectPath),
    fetchSwarmRuns(client, projectPath),
  ]);
  const testRuns = [
    ...listedTestRuns,
    ...(await fetchUnlistedRecordedRuns(
      client,
      projectPath,
      backtests,
      listedTestRuns,
    )),
  ];

  return aggregateResults({
    projectUrl: projectPath,
    backtests,
    candidates:
      readWorkspaceJson<CandidatePrsResult>(repoRoot, TRY_PATHS.candidates)
        ?.candidates ?? [],
    testRuns,
    swarmRuns,
  });
};

/**
 * Backtest runs have no PR attached, so they list as "base" test runs. Both
 * listings are merged so nothing is missed whichever way the backend files
 * them; diff counts are then looked up for finished runs that lack one.
 */
const fetchTestRuns = async (
  client: MeticulousClient,
  projectPath: string | null,
): Promise<TestRunSummary[]> => {
  const [prRuns, baseRuns] = await Promise.all([
    getTestRuns(client, {
      includeDiffCount: true,
      limit: TEST_RUNS_PAGE,
    }),
    getTestRuns(client, { baseTestRuns: true, limit: TEST_RUNS_PAGE }),
  ]);
  const byId = new Map<string, TestRunListItem>();
  for (const run of [...prRuns.testRuns, ...baseRuns.testRuns]) {
    byId.set(run.id, { ...byId.get(run.id), ...run });
  }
  const runs = [...byId.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return Promise.all(
    runs.map(async (run) => ({
      id: run.id,
      commitSha: run.commitSha,
      status: run.status,
      diffCount: run.diffCount ?? (await lookUpDiffCount(client, run)),
      url: testRunUrl(projectPath, run.id),
    })),
  );
};

/**
 * The listings can leave out runs the backtesters triggered (e.g. a comparison
 * run with no pull request while it is still running), so every recorded id
 * they miss is looked up directly.
 */
const fetchUnlistedRecordedRuns = async (
  client: MeticulousClient,
  projectPath: string | null,
  backtests: BacktestRecord[],
  listed: TestRunSummary[],
): Promise<TestRunSummary[]> => {
  const listedIds = new Set(listed.map((run) => run.id));
  const missingIds = [
    ...new Set(
      backtests
        .flatMap((record) => [record.baseTestRunId, record.headTestRunId])
        .filter((id): id is string => id != null && !listedIds.has(id)),
    ),
  ];
  const runs = await Promise.all(
    missingIds.map(async (testRunId): Promise<TestRunSummary | null> => {
      const run = await getTestRun({ client, testRunId }).catch(() => null);
      if (!run) {
        return null;
      }
      return {
        id: run.id,
        commitSha: run.commitSha ?? "",
        status: run.status,
        diffCount: await lookUpDiffCount(client, run),
        url: testRunUrl(projectPath, run.id),
      };
    }),
  );
  return runs.filter((run): run is TestRunSummary => run != null);
};

const testRunUrl = (projectPath: string | null, testRunId: string): string =>
  projectPath
    ? `${projectPath}/test-runs/${testRunId}`
    : `${METICULOUS_APP_URL}/test-runs/${testRunId}`;

const lookUpDiffCount = async (
  client: MeticulousClient,
  run: Pick<TestRunListItem, "id" | "status">,
): Promise<number | null> => {
  if (run.status !== "Success" && run.status !== "Failure") {
    return null;
  }
  const counts = await getTestRunDiffsSummaryCounts(client, run.id).catch(
    () => null,
  );
  if (!counts || isTestRunProcessingResponse(counts)) {
    return null;
  }
  return counts.numDiffs;
};

const fetchSwarmRuns = async (
  client: MeticulousClient,
  projectPath: string | null,
): Promise<SwarmRunSummary[]> => {
  const { swarmRuns } = await getAgentSwarmRuns(client, {
    includeCounts: true,
    limit: SWARM_RUNS_PAGE_WITH_COUNTS,
  });
  return Promise.all(
    swarmRuns.map(async (run) => ({
      id: run.swarmRunId,
      commitSha: run.commitSha,
      status: run.status,
      counts: pickCounts(run),
      failingCases:
        (run.fail ?? 0) > 0 ? await fetchFailingCases(client, run) : [],
      url: projectPath
        ? `${projectPath}/agent-swarm/runs/${run.swarmRunId}`
        : METICULOUS_APP_URL,
    })),
  );
};

const fetchFailingCases = async (
  client: MeticulousClient,
  run: AgentSwarmRunListItem,
): Promise<SwarmFailingCase[]> => {
  const response = await getAgentSwarmRun(
    client,
    { swarmRunId: run.swarmRunId },
    { status: "fail" },
  ).catch(() => null);
  if (!response || isAgentSwarmRunProcessingResponse(response)) {
    return [];
  }
  return response.cases.map((testCase) => ({
    caseIndex: testCase.caseIndex,
    title: testCase.title,
    summary: testCase.takeaway ?? testCase.outcomeSummary ?? null,
    regressionCount: testCase.regressionCount,
  }));
};

const COUNT_KEYS = [
  "total",
  "pass",
  "fail",
  "blocked",
  "skipped",
  "notStarted",
  "running",
] as const;

const pickCounts = (run: AgentSwarmRunListItem): SwarmRunSummary["counts"] => {
  const counts: SwarmRunSummary["counts"] = {};
  for (const key of COUNT_KEYS) {
    const value = run[key];
    if (value != null) {
      counts[key] = value;
    }
  }
  return counts;
};

const readBacktestRecords = (repoRoot: string): BacktestRecord[] => {
  const dir = absoluteTryPath(repoRoot, TRY_PATHS.backtests);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => /^pr-\d+\.json$/.test(file))
    .map((file) => parseRecord(join(dir, file)))
    .filter((record): record is BacktestRecord => record !== null);
};

const parseRecord = (path: string): BacktestRecord | null => {
  try {
    const record = JSON.parse(readFileSync(path, "utf8")) as BacktestRecord;
    return typeof record.prNumber === "number" &&
      typeof record.headSha === "string" &&
      typeof record.baseSha === "string"
      ? record
      : null;
  } catch {
    return null;
  }
};
