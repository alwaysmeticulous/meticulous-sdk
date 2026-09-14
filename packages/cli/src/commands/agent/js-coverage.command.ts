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
  COVERAGE_ORDER_BY_FIELDS,
  createClientWithOAuth,
  getProjectJsCoverage,
  getReplayJsCoverage,
  getTestRunJsCoverage,
  isFetchError,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import { coerceLimit, coerceOffset } from "./paging-options.utils";
import { logResponseNotes } from "./response-notes.utils";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import {
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
import { withBaseRunRejectionAsUserError } from "./coverage-rejection.util";
import {
  assertCoverageResolvable,
  parseHeadPlusTestRunIds,
  parseTestRunIds,
  resolveFinishedCoverageRuns,
} from "./coverage-run-resolution.util";
import {
  assertSummaryCompatible,
  printCoverageSummary,
} from "./js-coverage-summary";
import type { Options } from "./js-coverage.types";

// Re-exported for callers/tests that historically imported these helpers from
// this command module.
export {
  assertCoverageResolvable as assertTestRunCoverageResolvable,
  assertSummaryCompatible,
  coverageColumnValue,
  coverageFileToJson,
  determineColumns,
  parseHeadPlusTestRunIds,
  parseTestRunIds,
  type Options,
};

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
    summary,
    dontWaitForTestRunToComplete,
    json,
  } = options;
  initLogger();

  assertLatestForProjectCompatible(options);
  assertSummaryCompatible(options);

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

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `--summary` reports fixed aggregate totals, so it resolves no columns at
  // all — hence before `determineColumns`, whose default-to-executed rule has
  // nothing to say about it.
  if (summary) {
    await printCoverageSummary(client, options);
    return;
  }

  const columns = determineColumns(options);

  if (latestForProject) {
    const result = await getProjectJsCoverage(
      client,
      buildProjectCoverageRequestOptions(options, columns),
    );
    await printProjectCoverage(
      client,
      project,
      result,
      columns,
      json,
      options.offset,
    );
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
    // Whole-test-run coverage. Coverage exists once every run involved has
    // finished, so `resolveFinishedCoverageRuns` blocks until they have
    // (default) or, with --dontWaitForTestRunToComplete, returns null and we
    // report the in-progress run and stop.
    const runs = await resolveFinishedCoverageRuns(client, options);
    if (runs == null) {
      // Keep stdout's shape stable: an unfinished run has no coverage yet, so
      // emit the empty JSON array / a header-only TSV (matching a finished run
      // with zero files) rather than nothing — the notice went to stderr.
      if (json) {
        console.log("[]");
      } else {
        console.log(["repoFilePath", ...columns].join("\t"));
      }
      return;
    }

    await printTestRunCoverage(
      client,
      runs.testRunId,
      options,
      columns,
      json,
      runs.unionTestRunIds,
    );
  }
};

/**
 * Whether a run has produced the artifacts a replay's coverage can be resolved
 * against (its clone-and-parse source-map→repo-path dictionary). A `Partial`
 * base run has: those artifacts are produced up front, so it can anchor a
 * replay even though its own coverage total isn't worth reporting on its own
 * (see `assertCoverageResolvable`).
 */
export const canAnchorReplayCoverage = (status: TestRunStatus): boolean =>
  isTestRunComplete(status) || isTestRunPartial(status);

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

// Executable / uncovered / count / percentage columns all need executable-line
// data we only have for whole test runs, as does ordering by any of them;
// --prDiffOnly reads a test-run-only artifact. Reject them for a single replay.
// (--globFilter and --includeAllFiles apply to replays too.)
export const assertTestRunOnlyFlagsUnsetForReplay = (
  options: Options,
): void => {
  const testRunOnly = (
    [
      ["includeExecutableRanges", options.includeExecutableRanges],
      ["includeUncoveredRanges", options.includeUncoveredRanges],
      ["includeLineCounts", options.includeLineCounts],
      ["includeCoveragePercentage", options.includeCoveragePercentage],
      ["orderBy", options.orderBy != null],
      ["order", options.order != null],
      ["limit", options.limit != null],
      ["offset", options.offset != null],
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
    globFilter: string[] | undefined;
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
      // Only retry against a run that can anchor the replay's repo paths (a
      // verdict, or a base run) — an unfinished or failed one can't. A
      // default-branch checkout resolves to a base run, so excluding those here
      // would skip disambiguation for the most common local case; it's the
      // replay's coverage being served, not the anchoring run's.
      if (fallback != null && canAnchorReplayCoverage(fallback.status)) {
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
  logNotice(`${files.length} files with coverage`);
};

export const buildProjectCoverageRequestOptions = (
  options: Options,
  columns: CoverageColumn[],
): ProjectJsCoverageOptions => {
  const requestOptions: ProjectJsCoverageOptions = {
    includeAllFiles: options.includeAllFiles,
    ...(options.project != null ? { project: options.project } : {}),
    ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
    ...coverageOrderingRequestOptions(options),
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  return requestOptions;
};

/**
 * The ordering/paging options, sent only when the caller actually set them —
 * an absent `limit` is what tells the backend to apply its own default page
 * size, so it must not be filled in here.
 */
const coverageOrderingRequestOptions = (
  options: Options,
): Pick<
  ProjectJsCoverageOptions,
  "orderBy" | "order" | "limit" | "offset"
> => ({
  ...(options.orderBy != null ? { orderBy: options.orderBy } : {}),
  ...(options.order != null ? { order: options.order } : {}),
  ...(options.limit != null ? { limit: options.limit } : {}),
  ...(options.offset != null ? { offset: options.offset } : {}),
});

export const printProjectCoverage = async (
  client: MeticulousClient,
  project: string | undefined,
  result: ProjectJsCoverageResponse,
  columns: CoverageColumn[],
  json: boolean,
  offset?: number,
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
  // May not be your current commit — --latestForProject always resolves the
  // project's own latest successful run, not any particular one.
  logNotice(
    `Resolved project coverage to test run ${result.testRunId}${result.commitSha != null ? ` (commit ${result.commitSha})` : ""}`,
  );
  logResponseNotes(result);
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
): Promise<void> => {
  // Send the resolved columns as explicit flags (the default-to-executed rule
  // lives here in `determineColumns`, not the backend), so the backend never
  // has to guess which columns a flagless request wants. Derive the flags from
  // the same `columns` array the headers/formatting use, so they stay in sync.
  const requestOptions: TestRunJsCoverageOptions = {
    includeAllFiles: options.includeAllFiles,
    ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
    ...(unionTestRunIds.length > 0 ? { unionTestRunIds } : {}),
    ...coverageOrderingRequestOptions(options),
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  requestOptions.prDiffOnly = options.prDiffOnly;
  const result = await fetchTestRunCoverage(client, testRunId, requestOptions);

  printCoverageFiles(result.files, columns, json);

  // Summary on stderr regardless of --json (which only changes stdout).
  logResponseNotes(result);
};

// The backend declines some coverage requests as routine rather than a fault —
// a base run that hasn't replayed its whole selected set (as the primary run or
// among `unionTestRunIds`), or a base run's `prDiffOnly` (it has no PR) — and
// those are relayed as clean user errors.
const fetchTestRunCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  requestOptions: TestRunJsCoverageOptions,
): Promise<TestRunJsCoverageResponseV2> =>
  withBaseRunRejectionAsUserError(() =>
    getTestRunJsCoverage(client, testRunId, requestOptions),
  );

export const isAmbiguousTestRunError = (error: unknown): boolean =>
  isFetchError(error) &&
  (error.response?.data as { reason?: string } | undefined)?.reason ===
    "ambiguous-test-run";

export const jsCoverageCommand: CommandModule<unknown, Options> = {
  command: "js-coverage",
  describe:
    "Get the list of per-file JavaScript coverage for a whole test run, a project's preferred latest successful test run, or a single replay (or a single screenshot of it). Outputs a TSV table with columns repoFilePath plus the requested additional columns (default if none: executedRanges), ordered by --orderBy and limited to the first 100 files unless --limit says otherwise. Pass --summary to print the run's aggregate totals instead of the list.",
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
        "Return coverage from the project's preferred latest successful test run (the same run used by the webapp's project coverage view) — not necessarily your current commit. Uses --project when provided, otherwise the token's project or the OAuth user's default project. Cannot be combined with an explicit run/commit/replay, --prDiffOnly, run unions, or --dontWaitForTestRunToComplete.",
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
        "Useful for checking combined coverage of the resolved run with additional custom-session test runs, each covering a subset of sessions. No run may still be running, and all must belong to the same project and have executed the exact same commit as the run resolved above " +
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
      array: true,
      description:
        "Output only files whose repo path matches this gitignore-style glob (e.g. src/components/**). Repeatable: pass it more than once to match any of several globs.",
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
    includeLineCounts: {
      boolean: true,
      default: false,
      description:
        "Add executedLines, executableLines and uncoveredLines columns with the per-file line counts. Orders of magnitude smaller than the equivalent ranges, so prefer these to find the files worth looking at and ask for ranges only for those. Whole-test-run coverage only.",
    },
    includeCoveragePercentage: {
      boolean: true,
      default: false,
      description:
        "Add a coveragePercentage column with the per-file coverage percentage (0–100). Whole-test-run coverage only.",
    },
    orderBy: {
      string: true,
      choices: [...COVERAGE_ORDER_BY_FIELDS],
      description:
        "Order the output by this column (default repoFilePath). The numeric columns default to descending, so --orderBy=uncoveredLines --limit=50 outputs the fifty least-covered files. Orderable regardless of which columns are output. Whole-test-run coverage only.",
    },
    order: {
      string: true,
      choices: ["asc", "desc"],
      description:
        "Sort direction, overriding the default for the chosen --orderBy (ascending for repoFilePath, descending for the numeric columns). Whole-test-run coverage only.",
    },
    limit: {
      number: true,
      description:
        "Maximum files to output (1-1000, default 100). Pair with --orderBy so a page is the files that matter rather than a truncated alphabetical prefix; the count of matching files is reported on stderr. Whole-test-run coverage only.",
      coerce: coerceLimit(1000),
    },
    offset: {
      number: true,
      description:
        "Files to skip before --limit, for pagination. Whole-test-run coverage only.",
      coerce: coerceOffset,
    },
    summary: {
      boolean: true,
      default: false,
      description:
        "Get the run's aggregate JavaScript coverage totals instead of the per-file list: the run it resolved to (testRunId, commitSha, executionSha), the number of files with coverage and how many of them failed to parse, executed / executable / uncovered line counts, and the coverage percentage (plus coveragePercentageMax, the optimistic end of the range the webapp shows, when some file failed to parse). " +
        "Prefer this over summing the per-file columns yourself. Cannot be combined with the column or filter flags, only with the run selection, --json and --dontWaitForTestRunToComplete.",
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
