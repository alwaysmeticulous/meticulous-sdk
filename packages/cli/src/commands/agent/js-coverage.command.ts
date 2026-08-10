import type { TestRunStatus } from "@alwaysmeticulous/api";
import type {
  MeticulousClient,
  ProjectJsCoverageOptions,
  ProjectJsCoverageResponse,
  ReplayJsCoverageResponse,
  TestRunJsCoverageOptions,
  TestRunJsCoverageResponseV2,
} from "@alwaysmeticulous/client";
import {
  createClientWithOAuth,
  getProjectJsCoverage,
  getReplayJsCoverage,
  getTestRun,
  getTestRunJsCoverage,
  isFetchError,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
  isTestRunComplete,
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
  tryResolveTestRunForCommit,
} from "../../utils/resolve-test-run-from-commit";
import {
  COVERAGE_COLUMN_FLAG,
  coverageColumnValue,
  coverageFileToJson,
  determineColumns,
  formatCoverageColumn,
  type CoverageColumn,
} from "./coverage-columns.util";

// Re-exported for callers/tests that historically imported these helpers from
// this command module.
export { coverageColumnValue, coverageFileToJson, determineColumns };

export interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  latestForProject: boolean;
  project?: string | undefined;
  replayId: string | undefined;
  screenshotName: string | undefined;
  headPlusTestRunIds: string | undefined;
  testRunIds: string | undefined;
  includeAllFiles: boolean;
  globFilter: string | undefined;
  prDiffOnly: boolean;
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeCoveragePercentage: boolean;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const handler = async (options: Options): Promise<void> => {
  const {
    apiToken,
    testRunId,
    commitSha,
    latestForProject,
    project,
    replayId,
    screenshotName,
    headPlusTestRunIds,
    testRunIds,
    globFilter,
    dontWaitForTestRunToComplete,
    json,
  } = options;
  initLogger();

  assertLatestForProjectCompatible(options);

  if (screenshotName != null && replayId == null) {
    throw new CliUserError("--screenshotName only applies to --replayId.");
  }

  // --testRunId and --commitSha are two ways to name a run; passing both is
  // ambiguous on both paths (whole-test-run and --replayId disambiguation).
  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  // With an explicit --testRunId already in hand, combining it with
  // --headPlusTestRunIds is redundant — --testRunIds covers exactly that case
  // (primary + extras in one ordered list).
  if (testRunId != null && headPlusTestRunIds != null) {
    throw new CliUserError(
      "--headPlusTestRunIds cannot be combined with --testRunId; use --testRunIds instead.",
    );
  }

  // --testRunIds replaces run resolution entirely (the first ID is the
  // primary), so it can't be combined with the other ways of naming one.
  if (
    testRunIds != null &&
    (testRunId != null || commitSha != null || headPlusTestRunIds != null)
  ) {
    throw new CliUserError(
      "--testRunIds cannot be combined with --testRunId, --commitSha, or --headPlusTestRunIds.",
    );
  }

  if (replayId != null) {
    assertTestRunOnlyFlagsUnsetForReplay(options);
  }

  const columns = determineColumns(options);

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  if (latestForProject) {
    const result = await getProjectJsCoverage(
      client,
      buildProjectCoverageRequestOptions(options, columns),
    );
    await printProjectCoverage(client, project, result, columns, json);
    return;
  }
  // --replayId takes precedence: repo file paths are resolved against the run
  // that executed the replay, and a --testRunId / --commitSha passed alongside
  // it acts as a membership gate / disambiguator (see below) rather than
  // selecting test-run coverage.
  if (replayId != null) {
    await printReplayCoverage(client, project, {
      testRunId,
      commitSha,
      replayId,
      screenshotName,
      includeAllFiles: options.includeAllFiles,
      globFilter,
      json,
    });
  } else {
    // Test-run coverage: --testRunIds names the primary (its first ID) and the
    // extras to union in directly; otherwise resolve a single primary from
    // --testRunId, else --commitSha, else the local checkout's HEAD, and take
    // extras (if any) from --headPlusTestRunIds. Coverage exists once the run
    // has stopped running — a finished verdict, or a base run that keeps
    // accumulating it — so block until it does (default) or, with
    // --dontWaitForTestRunToComplete, report the in-progress run and stop.
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
      ({ testRunId: resolvedTestRunId, status } =
        await resolveTestRunForCommitOrThrow(client, commitSha, project));
      rawUnionIds = parseHeadPlusTestRunIds(headPlusTestRunIds);
    }
    const printEmptyResult = (): void => {
      // Keep stdout's shape stable: an unfinished run has no coverage yet, so
      // emit the empty JSON array / a header-only TSV (matching a finished run
      // with zero files) rather than nothing — the notice went to stderr.
      if (json) {
        console.log("[]");
      } else {
        console.log(["repoFilePath", ...columns].join("\t"));
      }
    };

    const finishedStatus = await ensureTestRunFinished(
      client,
      resolvedTestRunId,
      status,
      { dontWait: dontWaitForTestRunToComplete },
    );
    if (finishedStatus == null) {
      printEmptyResult();
      return;
    }
    // Base runs (Partial) do have coverage and are accepted; fatal failures
    // already threw.
    assertTestRunCoverageAvailable(resolvedTestRunId, finishedStatus);
    assertPrDiffOnlyCompatible(resolvedTestRunId, finishedStatus, options);
    // Tracked so the "coverage grows over time" caveat can be attached to the
    // results, once there are some — a base run with nothing recorded yet
    // errors instead.
    const baseRunIds = isTestRunPartial(finishedStatus)
      ? [resolvedTestRunId]
      : [];

    // The extra runs (from --headPlusTestRunIds or the tail of --testRunIds)
    // don't change how the primary run above was resolved — they just add more
    // coverage to union in. Each extra run needs the same "finished" guarantee
    // as the primary.
    const unionTestRunIds = rawUnionIds.filter(
      (id) => id !== resolvedTestRunId,
    );
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
        printEmptyResult();
        return;
      }
      assertTestRunCoverageAvailable(unionTestRunId, unionFinishedStatus);
      if (isTestRunPartial(unionFinishedStatus)) {
        baseRunIds.push(unionTestRunId);
      }
    }

    await printTestRunCoverage(
      client,
      resolvedTestRunId,
      options,
      columns,
      json,
      unionTestRunIds,
      baseRunIds,
    );
  }
};

/**
 * Whether a run can serve coverage. `Partial` base runs can: coverage is
 * recorded per replay as sessions execute, so a session pool that has replayed
 * anything has coverage even though it never reaches a verdict — the backend
 * serves it, and the webapp and Relevant Session Execution both read it.
 */
export const canServeCoverage = (status: TestRunStatus): boolean =>
  isTestRunComplete(status) || isTestRunPartial(status);

/**
 * Asserts a resolved run can serve coverage, throwing for a fatal or unfinished
 * one and accepting a `Partial` base run. Throw-only: the base run is explained
 * by {@link logBaseRunCoverageNotice} once coverage has actually been returned,
 * since a run with nothing recorded yet fails instead and shouldn't first be
 * told its coverage "grows over time".
 */
export const assertTestRunCoverageAvailable = (
  testRunId: string,
  status: TestRunStatus,
): void => {
  if (isTestRunPartial(status)) {
    return;
  }
  assertTestRunComplete(testRunId, status, { resultName: "coverage" });
};

/**
 * A base run keeps executing sessions on demand, so its coverage is a moving
 * total rather than a fixed one — say so rather than letting the numbers read
 * as final. Emitted per base run involved (the primary and/or any unioned in).
 */
export const logBaseRunCoverageNotice = (baseRunIds: string[]): void => {
  for (const testRunId of baseRunIds) {
    logNotice(
      `Test run ${testRunId} is a base run (status: Partial): its sessions are executed on demand, so its coverage reflects the sessions replayed so far and grows over time.`,
    );
  }
};

/**
 * A base run has no PR, so its `coverage.pr.json` is written empty — scoping
 * coverage to it would answer "nothing covered" to a question that doesn't
 * apply to this kind of run. Rejected client-side to save the round trip; the
 * backend enforces the same rule for the MCP surface.
 */
export const assertPrDiffOnlyCompatible = (
  testRunId: string,
  status: TestRunStatus,
  { prDiffOnly }: Pick<Options, "prDiffOnly">,
): void => {
  if (prDiffOnly && isTestRunPartial(status)) {
    throw new CliUserError(BASE_RUN_NO_PR_DIFF_MESSAGE(testRunId));
  }
};

/**
 * The base-run coverage messages, kept in step with the backend's
 * (`packages/webapp-backend/src/agent/agent.base-run.utils.ts`) so the CLI and
 * MCP surfaces explain a base run the same way, whichever side rejects first —
 * differing only in naming a `--flag` rather than an MCP argument.
 */
const BASE_RUN_NO_PR_DIFF_MESSAGE = (testRunId: string): string =>
  `Test run ${testRunId} is a base run other test runs compare against, so it has no PR diff to scope coverage to. Drop --prDiffOnly to get its whole-run coverage.`;

/**
 * The backend's response-body `reason` marking an absent artifact as the
 * expected state for a base run, rather than a fault. Matched instead of the
 * prose (same convention as `isAmbiguousTestRunError`) so a genuinely missing
 * artifact on a completed run stays an unexpected error.
 */
const BASE_RUN_NO_COVERAGE_REASON = "base-run-no-coverage";

export const assertLatestForProjectCompatible = (options: Options): void => {
  if (!options.latestForProject) {
    return;
  }
  const incompatible = (
    [
      ["testRunId", options.testRunId != null],
      ["commitSha", options.commitSha != null],
      ["replayId", options.replayId != null],
      ["screenshotName", options.screenshotName != null],
      ["headPlusTestRunIds", options.headPlusTestRunIds != null],
      ["testRunIds", options.testRunIds != null],
      ["prDiffOnly", options.prDiffOnly],
      ["dontWaitForTestRunToComplete", options.dontWaitForTestRunToComplete],
    ] as const
  )
    .filter(([, enabled]) => enabled)
    .map(([name]) => `--${name}`);
  if (incompatible.length > 0) {
    throw new CliUserError(
      `--latestForProject cannot be combined with ${incompatible.join(", ")}.`,
    );
  }
};

// Executable / uncovered / percentage columns all need executable-line data we
// only have for whole test runs; --prDiffOnly reads a test-run-only artifact.
// Reject them for a single replay. (--globFilter and --includeAllFiles apply to
// replays too.)
export const assertTestRunOnlyFlagsUnsetForReplay = (
  options: Options,
): void => {
  const testRunOnly = (
    [
      ["includeExecutableRanges", options.includeExecutableRanges],
      ["includeUncoveredRanges", options.includeUncoveredRanges],
      ["includeCoveragePercentage", options.includeCoveragePercentage],
      ["prDiffOnly", options.prDiffOnly],
      ["headPlusTestRunIds", options.headPlusTestRunIds != null],
      ["testRunIds", options.testRunIds != null],
    ] as const
  )
    .filter(([, enabled]) => enabled)
    .map(([name]) => `--${name}`);
  if (testRunOnly.length > 0) {
    throw new CliUserError(
      `${testRunOnly.join(", ")} only appl${testRunOnly.length === 1 ? "ies" : "y"} to whole-test-run coverage, not --replayId.`,
    );
  }
};

// Comma-separated additional test run IDs to union in, alongside the resolved
// primary run. Rejects an explicitly-provided-but-empty list (e.g.
// --headPlusTestRunIds "" or --headPlusTestRunIds ",,,") rather than silently
// ignoring it, and silently dedupes (unlike --sessionIds's trigger semantics,
// a duplicate in a read-only combine request isn't a meaningful mistake).
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

// Comma-separated test run IDs where the first names the primary whole-run to
// query and the rest are unioned in exactly like --headPlusTestRunIds. An
// alternative entry point for callers that already have an ordered list of
// run IDs on hand, rather than resolving a primary via --testRunId/--commitSha
// first — mutually exclusive with both of those and with
// --headPlusTestRunIds (see the handler), since it replaces run resolution
// entirely.
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

// Resolves a commit to a test run id, used only to disambiguate which run a
// --replayId belongs to. The replay's own coverage exists once that replay has
// executed, independent of whole-run completion, so we don't require the run to
// be complete here (unlike the whole-test-run path) — getReplayJsCoverage
// surfaces an actionable error if the replay itself has no coverage yet.
const resolveTestRunIdForCommit = async (
  client: MeticulousClient,
  commitSha: string | undefined,
  project: string | undefined,
): Promise<string> => {
  const { testRunId } = await resolveTestRunForCommitOrThrow(
    client,
    commitSha,
    project,
  );
  return testRunId;
};

const printReplayCoverage = async (
  client: MeticulousClient,
  project: string | undefined,
  {
    testRunId,
    commitSha,
    replayId,
    screenshotName,
    includeAllFiles,
    globFilter,
    json,
  }: {
    testRunId: string | undefined;
    commitSha: string | undefined;
    replayId: string;
    screenshotName: string | undefined;
    includeAllFiles: boolean;
    globFilter: string | undefined;
    json: boolean;
  },
): Promise<void> => {
  // An explicit --commitSha selects the run client-side (the endpoint only
  // understands testRunId); --testRunId is passed through as-is.
  const effectiveTestRunId =
    testRunId ??
    (commitSha != null
      ? await resolveTestRunIdForCommit(client, commitSha, project)
      : undefined);

  try {
    const result = await getReplayJsCoverage(client, replayId, screenshotName, {
      testRunId: effectiveTestRunId,
      includeAllFiles,
      globFilter,
    });
    printReplayResult(result, json);
  } catch (error) {
    // When the caller gave us no run to anchor on and the replay is the head of
    // several runs, the endpoint can't pick one. Fall back to the run for the
    // local checkout's HEAD and retry; if that can't be resolved, surface the
    // original (actionable "pass testRunId") error unchanged.
    if (effectiveTestRunId == null && isAmbiguousTestRunError(error)) {
      const fallback = await tryResolveTestRunForCommit(
        client,
        undefined,
        project,
      );
      // Only retry against a run whose coverage we'd serve anyway (a verdict, or
      // a base run) — an unfinished or failed one has no usable coverage. A
      // default-branch checkout resolves to a base run, so excluding those here
      // would skip disambiguation for the most common local case.
      if (fallback != null && canServeCoverage(fallback.status)) {
        try {
          const result = await getReplayJsCoverage(
            client,
            replayId,
            screenshotName,
            {
              testRunId: fallback.testRunId,
              includeAllFiles,
              globFilter,
            },
          );
          // Only announce the fallback once it has actually worked, so a doomed
          // retry doesn't leave a misleading "retrying against run X" line.
          logNotice(
            `Replay is the head of multiple test runs; resolved coverage against test run ${fallback.testRunId} from the local commit.`,
          );
          printReplayResult(result, json);
          return;
        } catch {
          // The local-HEAD run doesn't contain this replay (e.g. inspecting a
          // replay from a different commit), so it can't disambiguate. Surface
          // the original, actionable "pass --testRunId" error instead.
          throw error;
        }
      }
    }
    throw error;
  }
};

const printReplayResult = (
  result: ReplayJsCoverageResponse,
  json: boolean,
): void => {
  // Replay coverage is keyed by repo path (source-map paths that don't resolve
  // are dropped), matching the test-run shape.
  const files = result.files ?? [];
  if (json) {
    printJson(
      files.map(([repoFilePath, executedRanges]) => ({
        repoFilePath,
        executedRanges,
      })),
    );
  } else {
    console.log(["repoFilePath", "executedRanges"].join("\t"));
    for (const [filePath, ranges] of files) {
      console.log([filePath, formatCoverageRanges(ranges)].join("\t"));
    }
  }

  // Summary on stderr regardless of --json (which only changes stdout).
  logNotice(`${files.length} file(s) with coverage`);
};

export const buildProjectCoverageRequestOptions = (
  options: Options,
  columns: CoverageColumn[],
): ProjectJsCoverageOptions => {
  const requestOptions: ProjectJsCoverageOptions = {
    includeAllFiles: options.includeAllFiles,
    ...(options.project != null ? { project: options.project } : {}),
    ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  return requestOptions;
};

export const printProjectCoverage = async (
  client: MeticulousClient,
  project: string | undefined,
  result: ProjectJsCoverageResponse,
  columns: CoverageColumn[],
  json: boolean,
): Promise<void> => {
  printCoverageFiles(result.files, columns, json);
  if (result.testRunId == null) {
    logNotice(
      await appendProjectSelectionHint(
        "No successful test run with coverage found for this project; returning empty coverage.",
        client,
        project,
      ),
    );
    return;
  }
  logNotice(`Resolved project coverage to test run ${result.testRunId}`);
  logNotice(`${result.files.length} file(s)`);
};

const printCoverageFiles = (
  files: ProjectJsCoverageResponse["files"],
  columns: CoverageColumn[],
  json: boolean,
): void => {
  if (json) {
    printJson(files.map((file) => coverageFileToJson(file, columns)));
  } else {
    console.log(["repoFilePath", ...columns].join("\t"));
    for (const file of files) {
      const fields = [
        file.repoFilePath,
        ...columns.map((column) => formatCoverageColumn(file, column)),
      ];
      console.log(fields.join("\t"));
    }
  }
};

const printTestRunCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  options: Options,
  columns: CoverageColumn[],
  json: boolean,
  unionTestRunIds: string[],
  baseRunIds: string[],
): Promise<void> => {
  // Send the resolved columns as explicit flags (the default-to-executed rule
  // lives here in `determineColumns`, not the backend), so the backend never
  // has to guess which columns a flagless request wants. Derive the flags from
  // the same `columns` array the headers/formatting use, so they stay in sync.
  const requestOptions: TestRunJsCoverageOptions = {
    includeAllFiles: options.includeAllFiles,
    ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
    ...(unionTestRunIds.length > 0 ? { unionTestRunIds } : {}),
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  requestOptions.prDiffOnly = options.prDiffOnly;
  const result = await fetchTestRunCoverage(client, testRunId, requestOptions);

  printCoverageFiles(result.files, columns, json);

  // Summary on stderr regardless of --json (which only changes stdout). The
  // base-run caveat comes first, so the count below is read in its light.
  logBaseRunCoverageNotice(baseRunIds);
  logNotice(`${result.files.length} file(s)`);
};

/**
 * A base run whose sessions nothing has replayed yet has no coverage artifact,
 * which the backend reports as a 404 carrying
 * {@link BASE_RUN_NO_COVERAGE_REASON}. That's an expected outcome, not a bug, so
 * it's re-thrown as a `CliUserError` — otherwise it reaches the generic error
 * path, which pairs it with the unhelpful `--help` tip and reports it to Sentry.
 *
 * Keyed on that reason rather than "the request involved a base run": a union
 * can mix a base run with completed ones, and a completed run's missing
 * artifact is a real fault that must keep reaching Sentry. The backend's message
 * names the specific run, so it's surfaced as-is.
 */
const fetchTestRunCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  requestOptions: TestRunJsCoverageOptions,
): Promise<TestRunJsCoverageResponseV2> => {
  try {
    return await getTestRunJsCoverage(client, testRunId, requestOptions);
  } catch (error) {
    const body = errorResponseBody(error);
    if (body?.reason === BASE_RUN_NO_COVERAGE_REASON && body.message != null) {
      throw new CliUserError(body.message);
    }
    throw error;
  }
};

const errorResponseBody = (
  error: unknown,
): { reason?: string; message?: string } | undefined =>
  isFetchError(error)
    ? (error.response?.data as
        | { reason?: string; message?: string }
        | undefined)
    : undefined;

export const isAmbiguousTestRunError = (error: unknown): boolean =>
  isFetchError(error) &&
  (error.response?.data as { reason?: string } | undefined)?.reason ===
    "ambiguous-test-run";

export const jsCoverageCommand: CommandModule<unknown, Options> = {
  command: "js-coverage",
  describe:
    "Get the list of per-file JavaScript coverage for a whole test run, a project's preferred latest successful test run, or a single replay (or a single screenshot of it). Outputs a TSV table with columns repoFilePath plus the requested additional columns (default if none: executedRanges).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID. On its own, returns coverage for the whole test run. Combined with --replayId, the replay must belong to this run (head or base); if it was this run's head, paths resolve against this run, otherwise against the replay's own execution run. " +
        "Cannot be combined with --headPlusTestRunIds — use --testRunIds to combine multiple explicit run IDs.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: looks up the latest test run for the commit. For whole-test-run coverage, defaults to the current git HEAD when neither --testRunId nor --commitSha is given.",
    },
    latestForProject: {
      boolean: true,
      default: false,
      description:
        "Return coverage from the project's preferred latest successful test run (the same run used by the webapp's project coverage view). Uses --project when provided, otherwise the token's project or the OAuth user's default project. Cannot be combined with an explicit run/commit/replay, --prDiffOnly, run unions, or --dontWaitForTestRunToComplete.",
      // No yargs-level `conflicts` here: yargs treats a conflicting option as
      // "present" once it has a value, including its default — since
      // prDiffOnly/dontWaitForTestRunToComplete also default to false, that
      // would make every invocation (even a bare `js-coverage`) conflict with
      // itself. assertLatestForProjectCompatible below checks actual values
      // instead and covers every one of these flags.
    },
    project: {
      string: true,
      description:
        "The project to use for --latestForProject or commit lookup (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the token's project or the OAuth user's configured default project. Cannot be combined with --testRunId or --testRunIds, which already determine the project.",
      conflicts: ["testRunId", "testRunIds"],
    },
    replayId: {
      string: true,
      description:
        "The replay ID. Pass the base or head replay to get each side's coverage. Repo file paths are resolved against the run that executed the replay; --testRunId / --commitSha may be combined to disambiguate when the replay was the head of more than one run.",
    },
    screenshotName: {
      string: true,
      description:
        "Restrict coverage to this screenshot, which is only the coverage recorded since the preceding screenshot (for use with --replayId; omit for the whole replay).",
    },
    headPlusTestRunIds: {
      string: true,
      description:
        "Comma-separated additional test run IDs to union with the run resolved via --commitSha, or the current git HEAD by default (cannot be combined with --testRunId — use --testRunIds instead when you already have an explicit primary ID). " +
        "Useful for checking combined coverage of the base (resolved from --commitSha or the current git HEAD) with additional custom-session test runs, each covering a subset of sessions. No run may still be running, and all must belong to the same project and have executed the exact same commit as the run resolved above " +
        "(a PR's merge commit is recomputed whenever its base branch moves, so a run triggered against a since-advanced base is rejected). Whole-test-run coverage only.",
    },
    testRunIds: {
      string: true,
      description:
        "Comma-separated test run IDs: the first is the primary run coverage is returned for, the rest are unioned in exactly like --headPlusTestRunIds. An alternative to --testRunId/--commitSha for callers that already have an ordered list of run IDs on hand. " +
        "Cannot be combined with --testRunId, --commitSha, or --headPlusTestRunIds. Same constraints as --headPlusTestRunIds apply to the additional IDs (same project, same commit as the primary). Whole-test-run coverage only.",
    },
    includeAllFiles: {
      boolean: true,
      default: false,
      description:
        "Output all files, including those with no value in the requested columns (dropped by default). Works for both replay and whole-test-run coverage.",
    },
    globFilter: {
      string: true,
      description:
        "Output only files whose repo path matches this gitignore-style glob (e.g. src/components/**).",
    },
    prDiffOnly: {
      boolean: true,
      default: false,
      description:
        "Output only files changed in the PR diff (from coverage.pr.json). Whole-test-run coverage only, and not for a base run, which has no PR.",
    },
    includeExecutedRanges: {
      boolean: true,
      default: false,
      description:
        "Add an executedRanges column with the executed line ranges (default if none of the columns are requested).",
    },
    includeExecutableRanges: {
      boolean: true,
      default: false,
      description:
        "Add an executableRanges column with the executable line ranges. Whole-test-run coverage only.",
    },
    includeUncoveredRanges: {
      boolean: true,
      default: false,
      description:
        "Add an uncoveredRanges column with the uncovered line ranges (executable minus executed). Whole-test-run coverage only.",
    },
    includeCoveragePercentage: {
      boolean: true,
      default: false,
      description:
        "Add a coveragePercentage column with the per-file coverage percentage (0–100). Whole-test-run coverage only.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "For whole-test-run coverage, return immediately instead of the default of blocking until the run finishes; an unfinished run is then reported as not complete.",
    },
  },
  handler: wrapHandler(handler),
};
