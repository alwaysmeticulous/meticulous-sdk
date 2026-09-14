import type { TestRunStatus } from "@alwaysmeticulous/api";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getTestRun } from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

/** The runs a whole-test-run coverage request applies to, all finished. */
export interface ResolvedCoverageRuns {
  /** The run coverage is returned for. */
  testRunId: string;
  /** Additional runs to union in; empty when none were named. */
  unionTestRunIds: string[];
}

export interface CoverageRunSelection {
  testRunId: string | undefined;
  commitSha: string | undefined;
  testRunIds: string | undefined;
  headPlusTestRunIds: string | undefined;
  project?: string | undefined;
  dontWaitForTestRunToComplete: boolean;
}

/**
 * Resolves which runs a whole-test-run coverage request covers, and blocks
 * until each has finished (coverage exists only then).
 *
 * `--testRunIds` names the primary (its first ID) and the extras to union in
 * directly; otherwise the primary comes from `--testRunId`, else `--commitSha`,
 * else the local checkout's HEAD, and the extras from `--headPlusTestRunIds`.
 *
 * Which run is "the primary" is resolved the same way regardless of whether it
 * turns out to be a base run: whether such a run's coverage describes its
 * commit depends on how much of its selected set has replayed, which only the
 * backend knows, so it decides and a base run reached via any of these three
 * paths is treated identically (see {@link assertCoverageResolvable}).
 *
 * Returns `null` when `--dontWaitForTestRunToComplete` was passed and some run
 * has not finished — the caller then emits its own empty result.
 */
export const resolveFinishedCoverageRuns = async (
  client: MeticulousClient,
  {
    testRunId,
    commitSha,
    testRunIds,
    headPlusTestRunIds,
    project,
    dontWaitForTestRunToComplete,
  }: CoverageRunSelection,
): Promise<ResolvedCoverageRuns | null> => {
  let resolvedTestRunId: string;
  let status;
  let rawUnionIds: string[];
  if (testRunIds != null) {
    const ids = parseTestRunIds(testRunIds);
    resolvedTestRunId = ids[0];
    rawUnionIds = ids.slice(1);
    status = (await getTestRun({ client, testRunId: resolvedTestRunId }))
      .status;
  } else if (testRunId != null) {
    resolvedTestRunId = testRunId;
    status = (await getTestRun({ client, testRunId })).status;
    rawUnionIds = [];
  } else {
    const resolved = await resolveTestRunForCommitOrThrow(
      client,
      commitSha,
      project,
    );
    resolvedTestRunId = resolved.testRunId;
    status = resolved.status;
    rawUnionIds = parseHeadPlusTestRunIds(headPlusTestRunIds);
  }

  const finishedStatus = await ensureTestRunFinished(
    client,
    resolvedTestRunId,
    status,
    { dontWait: dontWaitForTestRunToComplete },
  );
  if (finishedStatus == null) {
    return null;
  }
  assertCoverageResolvable(resolvedTestRunId, finishedStatus);

  // The extra runs don't change how the primary was resolved — they just add
  // more coverage to union in. Each needs the same "finished" guarantee.
  const unionTestRunIds = assertNoSelfUnion(resolvedTestRunId, rawUnionIds);
  for (const unionTestRunId of unionTestRunIds) {
    const unionStatus = (
      await getTestRun({ client, testRunId: unionTestRunId })
    ).status;
    const unionFinishedStatus = await ensureTestRunFinished(
      client,
      unionTestRunId,
      unionStatus,
      { dontWait: dontWaitForTestRunToComplete },
    );
    if (unionFinishedStatus == null) {
      return null;
    }
    assertCoverageResolvable(unionTestRunId, unionFinishedStatus);
  }

  return { testRunId: resolvedTestRunId, unionTestRunIds };
};

/**
 * Asserts a resolved run's own coverage is resolvable at all, throwing for a
 * fatal or unfinished one. `Partial` is deliberately not rejected here — a base
 * run session pool sits in `Partial` indefinitely between requests, which is
 * not "unfinished" the way an in-progress run is, and whether it has a coverage
 * artifact at all depends on state only the backend has. So the request is sent
 * through, and the backend refuses it with `incomplete-base-run` if there is
 * nothing to serve yet — the CLI doesn't need to know "is this a base run" up
 * front to decide whether to even send it. A pool that has an artifact covering
 * fewer sessions than it selected is served rather than refused, with the
 * shortfall relayed from `notes` (see `logResponseNotes`).
 */
export const assertCoverageResolvable = (
  testRunId: string,
  status: TestRunStatus,
): void => {
  if (isTestRunPartial(status)) {
    return;
  }
  assertTestRunComplete(testRunId, status, { resultName: "coverage" });
};

/**
 * Rejects naming the run being queried among the runs to union in. A run
 * unioned with itself is just that run, so honouring it would answer a request
 * to combine with a single run's coverage — which reads as a collapse in
 * coverage against anything it's compared to. That is how the mistake shows up
 * in practice: passing the run a commit already resolves to. Checked here as
 * well as server-side to save the round trip.
 */
const assertNoSelfUnion = (
  resolvedTestRunId: string,
  rawUnionIds: string[],
): string[] => {
  if (rawUnionIds.includes(resolvedTestRunId)) {
    throw new CliUserError(
      `Test run ${resolvedTestRunId} is the run being queried, so it cannot also be one of the runs to union in — a run unioned with itself is just that run. Drop it, and name the other runs to combine with it.`,
    );
  }
  return rawUnionIds;
};

/**
 * Comma-separated additional test run IDs to union in, alongside the resolved
 * primary run. Rejects an explicitly-provided-but-empty list (e.g.
 * `--headPlusTestRunIds ""` or `--headPlusTestRunIds ",,,"`) rather than
 * silently ignoring it, and silently dedupes (unlike `--sessionIds`'s trigger
 * semantics, a duplicate in a read-only combine request isn't a meaningful
 * mistake).
 */
export const parseHeadPlusTestRunIds = (raw: string | undefined): string[] => {
  if (raw == null) {
    return [];
  }
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length === 0) {
    throw new CliUserError(
      "--headPlusTestRunIds was provided but contains no test run IDs.",
    );
  }
  return [...new Set(ids)];
};

/**
 * Comma-separated test run IDs where the first names the primary whole-run to
 * query and the rest are unioned in exactly like `--headPlusTestRunIds`. An
 * alternative entry point for callers that already have an ordered list of run
 * IDs on hand, rather than resolving a primary via `--testRunId`/`--commitSha`
 * first — mutually exclusive with both of those and with
 * `--headPlusTestRunIds`, since it replaces run resolution entirely.
 */
export const parseTestRunIds = (raw: string): string[] => {
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length === 0) {
    throw new CliUserError(
      "--testRunIds was provided but contains no test run IDs.",
    );
  }
  return ids;
};
