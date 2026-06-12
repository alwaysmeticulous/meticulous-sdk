import {
  createClient,
  getTestRunDiffsSummary,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  awaitTestRunCompletion,
  isTestRunInProgress,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  waitForTestRunToComplete: boolean;
  includeMatches: boolean;
  includeReplayIds: boolean;
  verbose: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const fmtMismatch = (v: number | null): string =>
  v != null ? v.toFixed(5) : "";

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  waitForTestRunToComplete,
  includeMatches,
  includeReplayIds,
  verbose,
}: Options): Promise<void> => {
  initLogger();

  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const client = createClient({ apiToken: apiToken_ });

  // Use --testRunId, else resolve the run from --commitSha or, when neither is
  // given, from the local checkout's HEAD.
  let resolvedTestRunId: string;
  if (testRunId != null) {
    resolvedTestRunId = testRunId;
  } else {
    const run = await resolveTestRunForCommitOrThrow(
      client,
      apiToken_,
      commitSha,
    );
    resolvedTestRunId = run.testRunId;
    // Diffs are only meaningful once the run has finished. If it is still
    // running and the caller didn't opt to wait, report it and stop.
    if (isTestRunInProgress(run.status) && !waitForTestRunToComplete) {
      log(
        `Test run ${run.testRunId} is still in progress (status: ${run.status}); ` +
          "pass --waitForTestRunToComplete to block until it finishes and then show diffs.",
      );
      return;
    }
  }

  if (waitForTestRunToComplete) {
    await awaitTestRunCompletion(client, resolvedTestRunId);
  }

  const t0 = performance.now();

  log(`Fetching diffs summary for test run ${resolvedTestRunId}...`);

  let response = await getTestRunDiffsSummary(client, resolvedTestRunId, {
    includeReplayIds,
    includeMatches,
  });

  // Poll until complete
  while (response.status === "pending" || response.status === "processing") {
    if (verbose) log(`Status: ${response.status}`);
    await sleep(2000);
    response = await getTestRunDiffsSummary(client, resolvedTestRunId, {
      includeReplayIds,
      includeMatches,
    });
  }

  if (response.status !== "complete") {
    log(`Error: unexpected status "${response.status}"`);
    process.exit(1);
  }

  const data = response.data ?? [];

  if (data.length === 0) {
    log("No replay diffs found for this test run.");
    return;
  }

  // Print TSV header
  const headerFields = [
    "replayDiffId",
    "screenshotName",
    "index",
    "total",
    "outcome",
    "mismatch",
    "domDiffIds",
  ];
  if (includeReplayIds) headerFields.push("baseReplayId", "headReplayId");
  console.log(headerFields.join("\t"));

  let totalDiffScreenshots = 0;

  for (const rd of data) {
    for (const s of rd.screenshots) {
      if (s.userVisibleOutcome === "difference") {
        totalDiffScreenshots++;
      }
      const fields: (string | number)[] = [
        rd.replayDiffId,
        s.screenshotName,
        s.index,
        s.total,
        s.outcome,
        fmtMismatch(s.mismatchFraction),
        s.domDiffIds,
      ];
      if (includeReplayIds)
        fields.push(rd.baseReplayId ?? "", rd.headReplayId ?? "");
      console.log(fields.join("\t"));
    }
  }

  const tEnd = performance.now();
  log(
    `${data.length} replay diff(s), ${totalDiffScreenshots} screenshot diff(s), total ${((tEnd - t0) / 1000).toFixed(1)}s`,
  );
};

export const testRunDiffsCommand: CommandModule<unknown, Options> = {
  command: "test-run-diffs",
  describe: "List replay diffs for a test run with summary",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is resolved from --commitSha, or from the local git HEAD when that is also omitted.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: the latest test run for the commit is resolved and used. Defaults to the local git HEAD when neither --testRunId nor --commitSha is given.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "If the test run is still in progress, block until it finishes before fetching diffs (otherwise an in-progress run is reported and the command exits).",
    },
    includeMatches: {
      boolean: true,
      description: "Include all screenshots (matches, known flakes), not just differences",
      default: false,
    },
    includeReplayIds: {
      boolean: true,
      description: "Include base and head replay IDs per replay diff",
      default: false,
    },
    verbose: {
      boolean: true,
      description: "Show polling status updates",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
