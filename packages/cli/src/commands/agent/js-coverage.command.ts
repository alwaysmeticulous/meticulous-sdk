import type {
  CompactRange,
  MeticulousClient,
  ReplayJsCoverageResponse,
  TestRunCoverageFile,
  TestRunJsCoverageOptions,
} from "@alwaysmeticulous/client";
import {
  createClientWithOAuth,
  getReplayJsCoverage,
  getTestRun,
  getTestRunJsCoverage,
  isFetchError,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
  isTestRunComplete,
  resolveTestRunForCommitOrThrow,
  tryResolveTestRunForCommit,
} from "../../utils/resolve-test-run-from-commit";

export interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  replayId: string | undefined;
  screenshotName: string | undefined;
  includeAllFiles: boolean;
  globFilter: string | undefined;
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeCoveragePercentage: boolean;
  prDiffOnly: boolean;
  headPlusTestRunIds: string | undefined;
  testRunIds: string | undefined;
  json: boolean;
}

// The per-file range/percentage columns, emitted (after `repoFilePath`) in this
// fixed order. `executableRanges`/`uncoveredRanges`/`coveragePercentage` rely on
// executable-line data we only have for whole test runs, so they're rejected
// alongside --replayId.
type CoverageColumn =
  | "executedRanges"
  | "executableRanges"
  | "uncoveredRanges"
  | "coveragePercentage";

// Single source of truth mapping each column to the request flag that asks for
// it, so the printed columns and the request payload can't drift apart.
const COVERAGE_COLUMN_FLAG: Record<
  CoverageColumn,
  | "includeExecutedRanges"
  | "includeExecutableRanges"
  | "includeUncoveredRanges"
  | "includeCoveragePercentage"
> = {
  executedRanges: "includeExecutedRanges",
  executableRanges: "includeExecutableRanges",
  uncoveredRanges: "includeUncoveredRanges",
  coveragePercentage: "includeCoveragePercentage",
};

const handler = async (options: Options): Promise<void> => {
  const {
    apiToken,
    testRunId,
    commitSha,
    dontWaitForTestRunToComplete,
    replayId,
    screenshotName,
    globFilter,
    headPlusTestRunIds,
    testRunIds,
    json,
  } = options;
  initLogger();

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

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // --replayId takes precedence: repo file paths are resolved against the run
  // that executed the replay, and a --testRunId / --commitSha passed alongside
  // it acts as a membership gate / disambiguator (see below) rather than
  // selecting test-run coverage.
  if (replayId != null) {
    await printReplayCoverage(client, apiToken_, {
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
    // extras (if any) from --headPlusTestRunIds. Coverage only exists once the
    // run has finished, so block until it does (default) or, with
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
        await resolveTestRunForCommitOrThrow(client, apiToken_, commitSha));
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
    // Reject session-pool bases (Partial); fatal failures already threw.
    assertTestRunComplete(resolvedTestRunId, finishedStatus, {
      resultName: "coverage",
    });

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
      assertTestRunComplete(unionTestRunId, unionFinishedStatus, {
        resultName: "coverage",
      });
    }

    await printTestRunCoverage(
      client,
      resolvedTestRunId,
      options,
      columns,
      json,
      unionTestRunIds,
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

// The columns (after `repoFilePath`) to request and print, in fixed order.
// Defaults to executed ranges when no column flag is given, so a bare
// invocation matches the historical output.
export const determineColumns = (options: Options): CoverageColumn[] => {
  const includeExecuted =
    options.includeExecutedRanges ||
    (!options.includeExecutableRanges &&
      !options.includeUncoveredRanges &&
      !options.includeCoveragePercentage);
  const columns: CoverageColumn[] = [];
  if (includeExecuted) {
    columns.push("executedRanges");
  }
  if (options.includeExecutableRanges) {
    columns.push("executableRanges");
  }
  if (options.includeUncoveredRanges) {
    columns.push("uncoveredRanges");
  }
  if (options.includeCoveragePercentage) {
    columns.push("coveragePercentage");
  }
  return columns;
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
  apiToken: string,
  commitSha: string | undefined,
): Promise<string> => {
  const { testRunId } = await resolveTestRunForCommitOrThrow(
    client,
    apiToken,
    commitSha,
  );
  return testRunId;
};

const printReplayCoverage = async (
  client: MeticulousClient,
  apiToken: string,
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
      ? await resolveTestRunIdForCommit(client, apiToken, commitSha)
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
        apiToken,
        undefined,
      );
      // Only retry against a run that finished with a verdict — an unfinished
      // or failed one has no usable coverage.
      if (fallback != null && isTestRunComplete(fallback.status)) {
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
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  requestOptions.prDiffOnly = options.prDiffOnly;
  const result = await getTestRunJsCoverage(client, testRunId, requestOptions);

  if (json) {
    printJson(result.files.map((file) => coverageFileToJson(file, columns)));
  } else {
    // Test-run coverage is the precomputed repo-mapped coverage, keyed by repo
    // paths. Emit `repoFilePath` then the requested columns in fixed order.
    console.log(["repoFilePath", ...columns].join("\t"));
    for (const file of result.files) {
      const fields = [
        file.repoFilePath,
        ...columns.map((column) => formatCoverageColumn(file, column)),
      ];
      console.log(fields.join("\t"));
    }
  }

  // Summary on stderr regardless of --json (which only changes stdout).
  logNotice(`${result.files.length} file(s)`);
};

// The JSON equivalent of a TSV row: `repoFilePath` plus the requested columns,
// with structured values (raw ranges / numeric percentage) rather than the
// TSV-formatted strings.
export const coverageFileToJson = (
  file: TestRunCoverageFile,
  columns: CoverageColumn[],
): Record<string, unknown> => {
  const row: Record<string, unknown> = { repoFilePath: file.repoFilePath };
  for (const column of columns) {
    row[column] = coverageColumnValue(file, column);
  }
  return row;
};

export const coverageColumnValue = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): CompactRange[] | number | null => {
  switch (column) {
    case "executedRanges":
      return file.executedRanges ?? [];
    case "executableRanges":
      return file.executableRanges ?? [];
    case "uncoveredRanges":
      return file.uncoveredRanges ?? [];
    case "coveragePercentage":
      return file.coveragePercentage ?? null;
    default:
      return assertNever(column);
  }
};

// The TSV rendering of a column: the same structured value as the JSON output,
// formatted as a string (ranges joined, percentage to 1dp, absent percentage as
// "n/a"). Delegating to `coverageColumnValue` keeps a single switch over the
// column union.
const formatCoverageColumn = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): string => {
  const value = coverageColumnValue(file, column);
  if (typeof value === "number") {
    return value.toFixed(1);
  }
  if (value == null) {
    return "n/a";
  }
  return formatCoverageRanges(value);
};

// Exhaustiveness guard for the CoverageColumn switch in `coverageColumnValue`.
// Local to this package since the public CLI can't depend on the internal
// common-utils helper.
const assertNever = (value: never): never => {
  throw new Error(`Unhandled coverage column: ${String(value)}`);
};

export const isAmbiguousTestRunError = (error: unknown): boolean =>
  isFetchError(error) &&
  (error.response?.data as { reason?: string } | undefined)?.reason ===
    "ambiguous-test-run";

export const jsCoverageCommand: CommandModule<unknown, Options> = {
  command: "js-coverage",
  describe:
    "Get JS coverage for a whole test run or a single replay. Outputs TSV, one row per repo file: repoFilePath plus the requested coverage columns (or JSON with --json).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    testRunId: {
      string: true,
      description:
        "The test run ID. On its own, returns coverage for the whole test run. Combined with --replayId, the replay must belong to this run (head or base); if it was this run's head, paths resolve against this run, otherwise against the replay's own execution run. " +
        "Cannot be combined with --headPlusTestRunIds — use --testRunIds to combine multiple explicit run IDs.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: the latest test run for the commit is resolved and used. For whole-test-run coverage, defaults to the local git HEAD when neither --testRunId nor --commitSha is given.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "For whole-test-run coverage, return immediately instead of the default of blocking until the run finishes; an unfinished run is then reported as not complete.",
    },
    replayId: {
      string: true,
      description:
        "The replay ID. Pass the base or head replay to get each side's coverage. Repo file paths are resolved against the run that executed the replay; --testRunId / --commitSha may be combined to disambiguate when the replay was the head of more than one run.",
    },
    screenshotName: {
      string: true,
      description:
        'Screenshot name (e.g. "after-event-5" or "end-state"), for use with --replayId. Omit for the whole replay.',
    },
    includeAllFiles: {
      boolean: true,
      default: false,
      description:
        "Return every file, regardless of the requested columns. By default a file is dropped unless at least one requested column has a value for it (e.g. with only executed ranges, files with no executed lines are dropped). Works for both replay and whole-test-run coverage.",
    },
    globFilter: {
      string: true,
      description:
        'Keep only repo file paths matching this gitignore-style glob, e.g. "src/components/**".',
    },
    includeExecutedRanges: {
      boolean: true,
      default: false,
      description:
        "Include the executed line ranges column. This is the default column when no other --include* range/percentage flag is given.",
    },
    includeExecutableRanges: {
      boolean: true,
      default: false,
      description:
        "Include the executable line ranges column (lines that could be executed). Whole-test-run coverage only.",
    },
    includeUncoveredRanges: {
      boolean: true,
      default: false,
      description:
        "Include the uncovered line ranges column (executable minus executed). Whole-test-run coverage only.",
    },
    includeCoveragePercentage: {
      boolean: true,
      default: false,
      description:
        "Include the coverage percentage column (0–100; executed / executable lines per file). Whole-test-run coverage only.",
    },
    prDiffOnly: {
      boolean: true,
      default: false,
      description:
        "Return only coverage for files changed in the PR diff (from coverage.pr.json). Whole-test-run coverage only.",
    },
    headPlusTestRunIds: {
      string: true,
      description:
        "Comma-separated additional test run IDs to union with the run resolved via --commitSha, or the local git HEAD by default (cannot be combined with --testRunId — use --testRunIds instead when you already have an explicit primary ID). " +
        "Useful for combining a project's normal coverage with the coverage of a few extra test runs. All runs must be finished, belong to the same project, and have executed the exact same commit as the run resolved above " +
        "(a PR's merge commit is recomputed whenever its base branch moves, so a run triggered against a since-advanced base is rejected). Whole-test-run coverage only.",
    },
    testRunIds: {
      string: true,
      description:
        "Comma-separated test run IDs: the first is the primary run coverage is returned for, the rest are unioned in exactly like --headPlusTestRunIds. An alternative to --testRunId/--commitSha for callers that already have an ordered list of run IDs on hand. " +
        "Cannot be combined with --testRunId, --commitSha, or --headPlusTestRunIds. Same constraints as --headPlusTestRunIds apply to the additional IDs (same project, same commit as the primary). Whole-test-run coverage only.",
    },
  },
  handler: wrapHandler(handler),
};
