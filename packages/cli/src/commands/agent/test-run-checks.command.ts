import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  getTestRun,
  getTestRunCheckReport,
  type TestRunCheckType,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  assertTestRunComplete,
  ensureTestRunFinished,
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  checkType: TestRunCheckType;
  checkId: string;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
  project?: string | undefined;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shorter than the diffs-summary poll timeout: unlike diffs (computed by a
 * backend workflow with a known SLA), a custom check's results depend on the
 * customer's own CI reporting them, so there's no guarantee they ever will —
 * better to give up and let the caller decide whether to retry than to block
 * for a long time on something that may never arrive.
 */
const REPORT_POLL_TIMEOUT_MS = 3 * 60_000;

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  checkType,
  checkId,
  dontWaitForTestRunToComplete,
  json,
  project,
}: Options): Promise<void> => {
  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  let resolvedTestRunId: string;
  let status: TestRunStatus;
  if (testRunId != null) {
    resolvedTestRunId = testRunId;
    status = (await getTestRun({ client, testRunId })).status;
  } else {
    const run = await resolveTestRunForCommitOrThrow(
      client,
      commitSha,
      project,
    );
    resolvedTestRunId = run.testRunId;
    status = run.status;
  }

  const finishedStatus = await ensureTestRunFinished(
    client,
    resolvedTestRunId,
    status,
    { dontWait: dontWaitForTestRunToComplete },
  );
  if (finishedStatus == null) {
    if (json) {
      printJson({ status: "processing" });
    }
    return;
  }
  if (isTestRunPartial(finishedStatus)) {
    throw new CliUserError(
      `Test run ${resolvedTestRunId} is a base run other test runs compare against and consequently has no check reports.`,
    );
  }
  assertTestRunComplete(resolvedTestRunId, finishedStatus, {
    resultName: "check reports",
  });

  logProgress(
    `Fetching ${checkType} check ${checkId} for test run ${resolvedTestRunId}...`,
  );
  let response = await getTestRunCheckReport(
    client,
    resolvedTestRunId,
    checkId,
    { checkType },
  );
  const deadline = performance.now() + REPORT_POLL_TIMEOUT_MS;
  if (response.status === "processing") {
    logProgress(
      `Waiting for ${checkType} check results for test run ${resolvedTestRunId}...`,
    );
  }
  while (response.status === "processing") {
    if (performance.now() >= deadline) {
      const minutes = REPORT_POLL_TIMEOUT_MS / 60_000;
      const caveat =
        checkType === "custom"
          ? " They may still be computing, or the reporting CI job may never call back — re-run this command later to check again."
          : " They may still be computing — re-run this command later to check again.";
      logNotice(
        `${checkType} check results for test run ${resolvedTestRunId} did not arrive within ${minutes} minutes.${caveat}`,
      );
      process.exit(1);
    }
    await sleep(2000);
    response = await getTestRunCheckReport(client, resolvedTestRunId, checkId, {
      checkType,
    });
  }

  if (response.status === "failed") {
    logNotice(
      `${checkType} check computation failed (${response.reason}) for test run ${resolvedTestRunId}; the report is not available for it.`,
    );
    process.exit(1);
  }

  if (json) {
    printJson(response);
  } else {
    console.log(response.text);
  }
};

export const testRunChecksCommand: CommandModule<unknown, Options> = {
  command: "test-run-checks",
  describe:
    "Get the Markdown report for a given non-visual check. Outputs the report text, blocking until the test run and check results are ready by default, for at most 3 minutes. For --checkType custom, an error saying the run is not expecting custom check results can be transient shortly after the run completes, since the customer's CI registers its checks separately: retry for a minute or so before concluding the run has no custom checks.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The test run ID. When omitted, the run is looked up from --commitSha, or from the current git HEAD when that is also omitted.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: looks up the latest test run for the commit. Defaults to the current git HEAD when neither --testRunId nor --commitSha is given.",
    },
    project: {
      string: true,
      description:
        "The project to look up the commit for (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project. Cannot be combined with --testRunId, which already determines the project.",
      conflicts: "testRunId",
    },
    checkType: {
      choices: ["builtin", "custom"] as const,
      default: "builtin" as const,
      description:
        "Who computed the check: builtin for a Meticulous-provided check, or custom for a customer-reported check. Defaults to builtin.",
    },
    checkId: {
      string: true,
      demandOption: true,
      description:
        "The check ID, for example accessibility or network-requests.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Report an in-progress test run and exit immediately instead of waiting.",
    },
  },
  handler: wrapHandler(handler),
};
