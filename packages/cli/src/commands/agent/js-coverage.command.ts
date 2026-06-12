import {
  CompactRange,
  createClient,
  getReplayJsCoverage,
  getTestRunJsCoverage,
  isFetchError,
  MeticulousClient,
  ReplayJsCoverageResponse,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  isTestRunInProgress,
  resolveTestRunForCommitOrThrow,
  tryResolveTestRunForCommit,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  screenshotName: string | undefined;
  json: boolean;
}

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const fmtRanges = (ranges: CompactRange[]): string =>
  ranges
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(";");

const handler = async ({
  apiToken,
  replayId,
  testRunId,
  commitSha,
  screenshotName,
  json,
}: Options): Promise<void> => {
  initLogger();

  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }
  if (screenshotName != null && replayId == null) {
    throw new CliUserError("--screenshotName only applies to --replayId.");
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const client = createClient({ apiToken: apiToken_ });

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
      json,
    });
  } else {
    // Test-run coverage: use --testRunId, else resolve the run from --commitSha
    // or, when neither is given, from the local checkout's HEAD.
    const resolvedTestRunId =
      testRunId ??
      (await resolveCompletedTestRunIdForCommit(client, apiToken_, commitSha));
    await printTestRunCoverage(client, resolvedTestRunId, json);
  }
};

// Resolves a commit to a test run for coverage. Coverage only exists once a run
// has finished, so an in-progress run is reported as not-yet-available rather
// than queried.
const resolveCompletedTestRunIdForCommit = async (
  client: MeticulousClient,
  apiToken: string,
  commitSha: string | undefined,
): Promise<string> => {
  const { testRunId, status } = await resolveTestRunForCommitOrThrow(
    client,
    apiToken,
    commitSha,
  );
  if (isTestRunInProgress(status)) {
    throw new CliUserError(
      `Test run ${testRunId} for this commit is still in progress (status: ${status}); coverage is not available yet.`,
    );
  }
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
    json,
  }: {
    replayId: string;
    screenshotName: string | undefined;
    testRunId: string | undefined;
    commitSha: string | undefined;
    json: boolean;
  },
): Promise<void> => {
  // An explicit --commitSha selects the run client-side (the endpoint only
  // understands testRunId); --testRunId is passed through as-is.
  const effectiveTestRunId =
    testRunId ??
    (commitSha != null
      ? await resolveCompletedTestRunIdForCommit(client, apiToken, commitSha)
      : undefined);

  try {
    const result = await getReplayJsCoverage(client, replayId, {
      screenshotName,
      testRunId: effectiveTestRunId,
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
      // Only retry against a finished run — an in-progress one has no coverage.
      if (fallback != null && !isTestRunInProgress(fallback.status)) {
        log(
          `Replay is the head of multiple test runs; retrying against test run ${fallback.testRunId} resolved from the local commit.`,
        );
        const result = await getReplayJsCoverage(client, replayId, {
          screenshotName,
          testRunId: fallback.testRunId,
        });
        printReplayResult(result, json);
        return;
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
    console.log([filePath, fmtRanges(ranges)].join("\t"));
  }

  log(`${files.length} file(s) with coverage`);
};

const printTestRunCoverage = async (
  client: MeticulousClient,
  testRunId: string,
  json: boolean,
): Promise<void> => {
  const result = await getTestRunJsCoverage(client, testRunId);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(["repoFilePath", "executedRanges"].join("\t"));
  // Test-run coverage is the precomputed repo-mapped coverage, keyed by repo paths.
  for (const [filePath, ranges] of result.files) {
    console.log([filePath, fmtRanges(ranges)].join("\t"));
  }

  log(`${result.files.length} file(s) with coverage`);
};

const isAmbiguousTestRunError = (error: unknown): boolean =>
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
    json: {
      boolean: true,
      description: "Output the raw coverage response as JSON",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
