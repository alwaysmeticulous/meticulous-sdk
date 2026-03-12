import {
  getReplayDiff,
  getTestRun,
  getTestRunReplayDiffs,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import chalk from "chalk";
import { DebugContext, ReplayDiffInfo } from "./debug.types";

interface ReplayApiResponse {
  id: string;
  sessionId?: string;
  projectId?: string;
  commitSha?: string;
  meticulousSha?: string;
  version?: string;
}

export interface ResolveDebugContextOptions {
  client: MeticulousClient;
  replayDiffId: string | undefined;
  testRunId: string | undefined;
  replayIds: string[];
  sessionId: string | undefined;
  maxDiffs: number;
  screenshot: string | undefined;
}

export const resolveDebugContext = async (
  options: ResolveDebugContextOptions,
): Promise<DebugContext> => {
  const { client } = options;

  const overrides = {
    screenshot: options.screenshot,
  };

  if (options.replayDiffId) {
    console.log(
      `Resolving from replay diff: ${chalk.cyan(options.replayDiffId)}`,
    );
    const context = await resolveFromReplayDiff(
      client,
      options.replayDiffId,
      options.sessionId,
    );
    return { ...context, ...overrides };
  }

  if (options.testRunId) {
    console.log(`Resolving from test run: ${chalk.cyan(options.testRunId)}`);
    const context = await resolveFromTestRun(
      client,
      options.testRunId,
      options.maxDiffs,
    );
    return { ...context, ...overrides };
  }

  console.log(
    `Resolving from replay IDs: ${chalk.cyan(options.replayIds.join(", "))}`,
  );
  const context = await resolveFromReplayIds(
    client,
    options.replayIds,
    options.sessionId,
  );
  return { ...context, ...overrides };
};

const resolveFromReplayDiff = async (
  client: MeticulousClient,
  replayDiffId: string,
  sessionIdOverride: string | undefined,
): Promise<DebugContext> => {
  console.log(chalk.cyan(`  Fetching replay diff ${replayDiffId}...`));
  const diff = await getReplayDiff(client, replayDiffId);
  if (!diff) {
    console.error(`Replay diff ${replayDiffId} not found.`);
    process.exit(1);
  }
  console.log(chalk.green(`  Replay diff fetched.`));

  const headReplayId = diff.headReplay.id;
  const baseReplayId = diff.baseReplay.id;
  const sessionId = diff.headReplay.sessionId ?? sessionIdOverride;
  const projectId = diff.project?.id;
  const testRunId = diff.testRun?.id;

  const replayIds = collectUniqueIds([headReplayId, baseReplayId]);
  const sessionIds = sessionId ? collectUniqueIds([sessionId]) : [];

  let baseCommitSha: string | undefined;
  let executionSha: string | undefined;
  if (testRunId) {
    try {
      console.log(
        chalk.cyan(`  Fetching test run ${testRunId} for base commit SHA...`),
      );
      const testRun = await getTestRun({ client, testRunId });
      baseCommitSha =
        (testRun?.configData as any)?.arguments?.baseCommitSha ?? undefined;
      executionSha = (testRun as any)?.executionSha ?? undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        chalk.yellow(
          `  Warning: Could not fetch test run ${testRunId} for base commit SHA: ${message}`,
        ),
      );
    }
  }

  return {
    testRunId,
    replayDiffs: [
      {
        id: replayDiffId,
        headReplayId,
        baseReplayId,
        sessionId,
        numScreenshotDiffs: diff.data?.screenshotDiffResults?.length ?? 0,
      },
    ],
    replayIds,
    sessionIds,
    projectId,
    orgAndProject: formatOrgAndProject(diff.project),
    meticulousSha: diff.headReplay.meticulousSha,
    executionSha,
    commitSha: diff.headReplay.commitSha,
    baseCommitSha,
    testRunStatus: diff.testRun?.status,
    screenshot: undefined,
  };
};

const resolveFromTestRun = async (
  client: MeticulousClient,
  testRunId: string,
  maxDiffs: number,
): Promise<DebugContext> => {
  console.log(chalk.cyan(`  Fetching test run ${testRunId}...`));
  const testRun = await getTestRun({ client, testRunId });
  if (!testRun) {
    console.error(`Test run ${testRunId} not found.`);
    process.exit(1);
  }
  console.log(chalk.green(`  Test run fetched.`));

  console.log(chalk.cyan(`  Fetching replay diffs for test run...`));
  const allDiffs = await getTestRunReplayDiffs({ client, testRunId });

  const diffsWithChanges = allDiffs.filter(
    (d) => (d.data?.screenshotDiffResults?.length ?? 0) > 0,
  );

  const selectedDiffs =
    diffsWithChanges.length > 0
      ? diffsWithChanges.slice(0, maxDiffs)
      : allDiffs.slice(0, maxDiffs);

  console.log(
    `Found ${chalk.green(allDiffs.length)} diffs (${chalk.green(diffsWithChanges.length)} with changes), downloading ${chalk.green(selectedDiffs.length)}`,
  );

  const replayDiffs: ReplayDiffInfo[] = selectedDiffs.map((d) => ({
    id: d.id,
    headReplayId: d.headReplay.id,
    baseReplayId: d.baseReplay.id,
    sessionId: d.headReplay.sessionId ?? undefined,
    numScreenshotDiffs: d.data?.screenshotDiffResults?.length ?? 0,
  }));

  const replayIds = collectUniqueIds(
    replayDiffs.flatMap((d) => [d.headReplayId, d.baseReplayId]),
  );
  const sessionIds = collectUniqueIds(
    replayDiffs.map((d) => d.sessionId).filter((s): s is string => s != null),
  );

  const firstHeadReplay = selectedDiffs[0]?.headReplay;

  return {
    testRunId,
    replayDiffs,
    replayIds,
    sessionIds,
    projectId: testRun.project?.id,
    orgAndProject: formatOrgAndProject(testRun.project),
    meticulousSha: firstHeadReplay?.meticulousSha,
    executionSha: (testRun as any).executionSha ?? undefined,
    commitSha: (testRun as any).commitSha,
    baseCommitSha:
      (testRun?.configData as any)?.arguments?.baseCommitSha ?? undefined,
    testRunStatus: testRun.status,
    screenshot: undefined,
  };
};

const fetchReplayDetails = async (
  client: MeticulousClient,
  replayId: string,
): Promise<ReplayApiResponse | null> => {
  const { data } = await client
    .get(`replays/${replayId}`)
    .catch((error: any) => {
      if (error?.response?.status === 404) {
        return { data: null };
      }
      throw error;
    });
  return data as ReplayApiResponse | null;
};

const resolveFromReplayIds = async (
  client: MeticulousClient,
  replayIds: string[],
  sessionIdOverride: string | undefined,
): Promise<DebugContext> => {
  console.log(
    chalk.cyan(`  Fetching details for ${replayIds.length} replay(s)...`),
  );
  const replayDetails = await Promise.all(
    replayIds.map(async (id) => {
      console.log(chalk.cyan(`    Fetching replay ${id}...`));
      const replay = await fetchReplayDetails(client, id);
      if (!replay) {
        console.warn(`Warning: Replay ${id} not found, skipping.`);
        return null;
      }
      return replay;
    }),
  );
  console.log(chalk.green(`  All replays fetched.`));

  const validReplays = replayDetails.filter(
    (r): r is ReplayApiResponse => r != null,
  );

  if (validReplays.length === 0) {
    console.error("Error: No valid replays found.");
    process.exit(1);
  }

  const uniqueReplayIds = collectUniqueIds(validReplays.map((r) => r.id));
  const sessionIds = collectUniqueIds(
    [
      ...validReplays.map((r) => r.sessionId),
      ...(sessionIdOverride ? [sessionIdOverride] : []),
    ].filter((s): s is string => s != null),
  );

  const firstReplay = validReplays[0];

  return {
    testRunId: undefined,
    replayDiffs: [],
    replayIds: uniqueReplayIds,
    sessionIds,
    projectId: firstReplay.projectId,
    orgAndProject: `project/${firstReplay.projectId}`,
    meticulousSha: firstReplay.meticulousSha,
    executionSha: undefined,
    commitSha: firstReplay.commitSha,
    baseCommitSha: undefined,
    testRunStatus: undefined,
    screenshot: undefined,
  };
};

const collectUniqueIds = (ids: string[]): string[] => [...new Set(ids)];

const formatOrgAndProject = (
  project: { name?: string; organization?: { name?: string } } | undefined,
): string => {
  if (!project) {
    return "unknown/unknown";
  }
  const orgName = project.organization?.name ?? "unknown";
  const projectName = project.name ?? "unknown";
  return `${orgName}/${projectName}`;
};
