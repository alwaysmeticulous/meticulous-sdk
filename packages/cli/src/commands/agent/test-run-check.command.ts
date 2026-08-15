import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  createClientWithOAuth,
  getTestRun,
  getTestRunCheckAvailableIds,
  getTestRunCheckReport,
  type TestRunCheckAvailableId,
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
  isSessionPool,
  isTestRunPartial,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  checkType: TestRunCheckType | undefined;
  checkId: string | undefined;
  availableIds: boolean;
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

const printAvailableIds = (checks: TestRunCheckAvailableId[]): void => {
  const columns: Array<{
    header: string;
    value: (check: TestRunCheckAvailableId) => string;
  }> = [
    { header: "checkType", value: (check) => check.checkType },
    { header: "checkId", value: (check) => check.checkId },
  ];
  console.log(columns.map((column) => column.header).join("\t"));
  for (const check of checks) {
    console.log(columns.map((column) => column.value(check)).join("\t"));
  }
};

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  checkType: checkTypeOption,
  checkId,
  availableIds,
  dontWaitForTestRunToComplete,
  json,
  project,
}: Options): Promise<void> => {
  if (testRunId != null && commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }

  if (availableIds) {
    const incompatible = (
      [
        [checkId != null, "--checkId"],
        [checkTypeOption != null, "--checkType"],
        [dontWaitForTestRunToComplete, "--dontWaitForTestRunToComplete"],
      ] as const
    )
      .filter(([enabled]) => enabled)
      .map(([, name]) => name);
    if (incompatible.length > 0) {
      throw new CliUserError(
        `--availableIds cannot be combined with: ${incompatible.join(", ")}. ` +
          "It lists check IDs instead of fetching a report; use it on its own " +
          "(optionally with --testRunId/--commitSha/--project/--json).",
      );
    }
  } else if (checkId == null) {
    throw new CliUserError(
      "--checkId is required unless --availableIds is set.",
    );
  }

  const checkType = checkTypeOption ?? "builtin";

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  let resolvedTestRunId: string;
  let status: TestRunStatus;
  let isSessionPoolRun: boolean;
  if (testRunId != null) {
    resolvedTestRunId = testRunId;
    const run = await getTestRun({ client, testRunId });
    status = run.status;
    // No eager/non-eager distinction here: a session-pool run has no check
    // reports of its own to serve regardless of eagerness (see
    // isBaseOrAnySessionPoolRun on the backend).
    isSessionPoolRun = isSessionPool(run.configData);
  } else {
    const run = await resolveTestRunForCommitOrThrow(
      client,
      commitSha,
      project,
    );
    resolvedTestRunId = run.testRunId;
    status = run.status;
    isSessionPoolRun = run.isSessionPoolRun;
  }

  // A base run exists to be compared against, not to be a change of its own,
  // so it has no check reports of its own. A session-pool base can settle
  // into Success/Failure without ever becoming Partial, so isSessionPoolRun
  // is checked independently of status — and, for the --checkId path below,
  // before waiting for the run to finish, since it's already known here and
  // there's no reason to block on (or silently skip past, with
  // --dontWaitForTestRunToComplete) a run that will never have check reports
  // (mirrors the backend's getTestRunCheckReport/getTestRunCheckAvailableIds).
  const assertNotBaseRun = (): void => {
    throw new CliUserError(
      `Test run ${resolvedTestRunId} is a base run other test runs compare against and consequently has no check reports.`,
    );
  };
  if (isSessionPoolRun) {
    assertNotBaseRun();
  }

  if (availableIds) {
    // --availableIds never waits for the run to finish (see the empty-list
    // notice below), so Partial — unlike an in-progress status — is already
    // knowable synchronously here, without polling.
    if (isTestRunPartial(status)) {
      assertNotBaseRun();
    }
    const checks = await getTestRunCheckAvailableIds(client, resolvedTestRunId);
    if (json) {
      printJson(checks);
    } else {
      printAvailableIds(checks);
    }
    if (checks.length === 0) {
      logNotice(
        `No check results have been reported for test run ${resolvedTestRunId} yet. ` +
          "This never waits for the run or its checks to finish, so an empty " +
          "list can also mean they simply haven't reported yet — re-run this " +
          "command in a minute or so before concluding the run has no checks.",
      );
    }
    return;
  }

  if (checkId == null) {
    // Unreachable: already validated above, before the OAuth login — this
    // narrows the type for everything below rather than guarding anything.
    throw new CliUserError(
      "--checkId is required unless --availableIds is set.",
    );
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
  // isSessionPoolRun was already checked above, before waiting; Partial only
  // becomes known once the run has finished.
  if (isTestRunPartial(finishedStatus)) {
    assertNotBaseRun();
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
    if (response.url != null) {
      console.log(response.url);
    }
  }
};

export const testRunCheckCommand: CommandModule<unknown, Options> = {
  command: "test-run-check",
  describe:
    "Get the Markdown report for a given non-visual check. Outputs the report text, blocking until the test run and check results are ready by default, for at most 3 minutes. A report too large to return inline instead prints a short notice plus a download URL. For --checkType custom, an error saying the run is not expecting custom check results can be transient shortly after the run completes, since the customer's CI registers its checks separately: retry for a minute or so before concluding the run has no custom checks. Pass --availableIds to list the check IDs available for the run instead of fetching a report.",
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
      description:
        "Who computed the check: builtin for a Meticulous-provided check, or custom for a customer-reported check. Defaults to builtin.",
    },
    checkId: {
      string: true,
      description:
        "The check ID. Use --availableIds to list the check IDs available for a test run.",
    },
    availableIds: {
      boolean: true,
      default: false,
      description:
        "List the check IDs that have reported results for the test run, instead of fetching a report. Outputs a TSV table with columns checkType, checkId. Unlike fetching a report, this never waits for the test run or its checks to finish: an empty list shortly after triggering a run can mean the checks simply haven't reported yet rather than that none exist, so retry for a minute or so (the same budget a report fetch gives itself) before concluding the run has no checks.",
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
