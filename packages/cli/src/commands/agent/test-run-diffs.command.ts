import { createClient, getTestRunDiffsSummary } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string;
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
  includeMatches,
  includeReplayIds,
  verbose,
}: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });
  const t0 = performance.now();

  log(`Fetching diffs summary for test run ${testRunId}...`);

  let response = await getTestRunDiffsSummary(client, testRunId, {
    includeReplayIds,
    includeMatches,
  });

  // Poll until complete
  while (response.status === "pending" || response.status === "processing") {
    if (verbose) log(`Status: ${response.status}`);
    await sleep(2000);
    response = await getTestRunDiffsSummary(client, testRunId, {
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
      description: "The test run ID",
      demandOption: true,
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
