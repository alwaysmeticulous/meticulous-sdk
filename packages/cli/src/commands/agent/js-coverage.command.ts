import type {
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
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
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
  replayId: string | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  screenshotName: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeCoveragePercentage: boolean;
  includeAllFiles: boolean;
  prDiffOnly: boolean;
  globFilter: string | undefined;
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

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const handler = async (options: Options): Promise<void> => {
  const {
    apiToken,
    replayId,
    testRunId,
    commitSha,
    screenshotName,
    dontWaitForTestRunToComplete,
    globFilter,
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
      replayId,
      screenshotName,
      testRunId,
      commitSha,
      globFilter,
      includeAllFiles: options.includeAllFiles,
      json,
    });
  } else {
    // Test-run coverage: use --testRunId, else resolve the run from --commitSha
    // or, when neither is given, from the local checkout's HEAD. Coverage only
    // exists once the run has finished, so block until it does (default) or, with
    // --dontWaitForTestRunToComplete, report the in-progress run and stop.
    let resolvedTestRunId: string;
    let status;
    if (testRunId != null) {
      resolvedTestRunId = testRunId;
      status = (await getTestRun({ client, testRunId })).status;
    } else {
      ({ testRunId: resolvedTestRunId, status } =
        await resolveTestRunForCommitOrThrow(client, apiToken_, commitSha));
    }
    const finishedStatus = await ensureTestRunFinished(
      client,
      resolvedTestRunId,
      status,
      { dontWait: dontWaitForTestRunToComplete },
    );
    if (finishedStatus == null) {
      return;
    }
    // Reject session-pool bases (Partial); fatal failures already threw.
    assertTestRunComplete(resolvedTestRunId, finishedStatus, {
      resultName: "coverage",
    });
    await printTestRunCoverage(
      client,
      resolvedTestRunId,
      options,
      columns,
      json,
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
    replayId,
    screenshotName,
    testRunId,
    commitSha,
    globFilter,
    includeAllFiles,
    json,
  }: {
    replayId: string;
    screenshotName: string | undefined;
    testRunId: string | undefined;
    commitSha: string | undefined;
    globFilter: string | undefined;
    includeAllFiles: boolean;
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
      globFilter,
      includeAllFiles,
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
              globFilter,
              includeAllFiles,
            },
          );
          // Only announce the fallback once it has actually worked, so a doomed
          // retry doesn't leave a misleading "retrying against run X" line.
          log(
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
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(["repoFilePath", "executedRanges"].join("\t"));
  // Replay coverage is keyed by repo path (source-map paths that don't resolve
  // are dropped), matching the test-run shape.
  const files = result.files ?? [];
  for (const [filePath, ranges] of files) {
    console.log([filePath, formatCoverageRanges(ranges)].join("\t"));
  }

  log(`${files.length} file(s) with coverage`);
};

const printTestRunCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  options: Options,
  columns: CoverageColumn[],
  json: boolean,
): Promise<void> => {
  // Send the resolved columns as explicit flags (the default-to-executed rule
  // lives here in `determineColumns`, not the backend), so the backend never
  // has to guess which columns a flagless request wants. Derive the flags from
  // the same `columns` array the headers/formatting use, so they stay in sync.
  const requestOptions: TestRunJsCoverageOptions = {
    includeAllFiles: options.includeAllFiles,
    prDiffOnly: options.prDiffOnly,
    ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
  };
  for (const column of columns) {
    requestOptions[COVERAGE_COLUMN_FLAG[column]] = true;
  }
  const result = await getTestRunJsCoverage(client, testRunId, requestOptions);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

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

  log(`${result.files.length} file(s)`);
};

const formatCoverageColumn = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): string => {
  switch (column) {
    case "executedRanges":
      return formatCoverageRanges(file.executedRanges ?? []);
    case "executableRanges":
      return formatCoverageRanges(file.executableRanges ?? []);
    case "uncoveredRanges":
      return formatCoverageRanges(file.uncoveredRanges ?? []);
    case "coveragePercentage":
      return file.coveragePercentage == null
        ? "n/a"
        : file.coveragePercentage.toFixed(1);
    default: {
      // Exhaustiveness guard: a new CoverageColumn must be handled above.
      const exhaustive: never = column;
      throw new Error(`Unhandled coverage column: ${String(exhaustive)}`);
    }
  }
};

export const isAmbiguousTestRunError = (error: unknown): boolean =>
  isFetchError(error) &&
  (error.response?.data as { reason?: string } | undefined)?.reason ===
    "ambiguous-test-run";

export const jsCoverageCommand: CommandModule<unknown, Options> = {
  command: "js-coverage",
  describe:
    "Get JS coverage for a single replay or a whole test run (use js-coverage-diff for base vs head)",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayId: {
      string: true,
      description:
        "The replay ID. Pass the base or head replay to get each side's coverage. Repo file paths are resolved against the run that executed the replay; --testRunId / --commitSha may be combined to disambiguate when the replay was the head of more than one run.",
    },
    testRunId: {
      string: true,
      description:
        "The test run ID. On its own, returns coverage for the whole test run. Combined with --replayId, the replay must belong to this run (head or base); if it was this run's head, paths resolve against this run, otherwise against the replay's own execution run.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: the latest test run for the commit is resolved and used. For whole-test-run coverage, defaults to the local git HEAD when neither --testRunId nor --commitSha is given.",
    },
    screenshotName: {
      string: true,
      description:
        'Screenshot name (e.g. "after-event-5" or "end-state"), for use with --replayId. Omit for the whole replay.',
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "For whole-test-run coverage, return immediately instead of the default of blocking until the run finishes; an unfinished run is then reported as not complete.",
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
    includeAllFiles: {
      boolean: true,
      default: false,
      description:
        "Return every file, regardless of the requested columns. By default a file is dropped unless at least one requested column has a value for it (e.g. with only executed ranges, files with no executed lines are dropped). Works for both replay and whole-test-run coverage.",
    },
    prDiffOnly: {
      boolean: true,
      default: false,
      description:
        "Return only coverage for files changed in the PR diff (from coverage.pr.json). Whole-test-run coverage only.",
    },
    globFilter: {
      string: true,
      description:
        'Keep only repo file paths matching this gitignore-style glob, e.g. "src/components/**".',
    },
    json: {
      boolean: true,
      description: "Output the raw coverage response as JSON",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
