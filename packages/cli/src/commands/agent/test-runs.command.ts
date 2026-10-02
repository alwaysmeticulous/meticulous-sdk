import {
  createClientWithOAuth,
  getTestRuns,
  type TestRunListItem,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { logResponseNotes } from "./response-notes.utils";

// Mirrors of the server-side MAX_TEST_RUNS_LIMIT and
// MAX_TEST_RUNS_LIMIT_WITH_JSON_FIELDS (webapp-backend's
// agent-test-runs.types.ts), as client-side pre-checks — keep in sync.
const MAX_TEST_RUNS_LIMIT = 1000;
const MAX_TEST_RUNS_LIMIT_WITH_JSON_FIELDS = 100;

// Mirrors the server-side BUILTIN_CHECKS ids (@alwaysmeticulous/builtin-checks,
// which a public package can't depend on), for the --checkIds description only;
// the server validates them — keep in sync.
const BUILTIN_CHECK_IDS = [
  "accessibility",
  "network-requests",
  "react-component-renders",
];

interface Options {
  apiToken?: string | null | undefined;
  project?: string | undefined;
  prNumber?: string | undefined;
  baseTestRuns?: boolean | undefined;
  latestPerPullRequest?: boolean | undefined;
  status?: string | undefined;
  withDiffsOnly?: boolean | undefined;
  withCheckIssuesOnly?: boolean | undefined;
  checkIds?: string | undefined;
  createdSince?: string | undefined;
  createdUntil?: string | undefined;
  includeBaseTestRunId?: boolean | undefined;
  includeDiffCount?: boolean | undefined;
  includeDurationSeconds?: boolean | undefined;
  includeCheckIssueCounts?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

interface Column {
  header: string;
  value: (testRun: TestRunListItem) => string;
}

const handler = async ({
  apiToken,
  project,
  prNumber,
  baseTestRuns,
  latestPerPullRequest,
  status,
  withDiffsOnly,
  withCheckIssuesOnly,
  checkIds,
  createdSince,
  createdUntil,
  includeBaseTestRunId,
  includeDiffCount,
  includeDurationSeconds,
  includeCheckIssueCounts,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  if (
    (includeBaseTestRunId || includeDiffCount) &&
    limit != null &&
    limit > MAX_TEST_RUNS_LIMIT_WITH_JSON_FIELDS
  ) {
    throw new Error(
      `--limit must be at most ${MAX_TEST_RUNS_LIMIT_WITH_JSON_FIELDS} with --includeBaseTestRunId or --includeDiffCount.`,
    );
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getTestRuns(client, {
    project,
    prNumber,
    baseTestRuns,
    latestPerPullRequest,
    status,
    withDiffsOnly,
    withCheckIssuesOnly,
    checkIds,
    createdSince,
    createdUntil,
    includeBaseTestRunId,
    includeDiffCount,
    includeDurationSeconds,
    includeCheckIssueCounts,
    limit,
    offset,
  });
  const { testRuns } = response;

  if (json) {
    printJson(testRuns);
  } else if (testRuns.length > 0) {
    // prNumber is dropped under --baseTestRuns, where no row has one.
    const columns: Column[] = [
      { header: "id", value: (testRun) => testRun.id },
      { header: "createdAt", value: (testRun) => testRun.createdAt },
      { header: "status", value: (testRun) => testRun.status },
      { header: "commitSha", value: (testRun) => testRun.commitSha },
      ...optionalColumn(
        !baseTestRuns,
        "prNumber",
        (testRun) => testRun.prNumber,
      ),
      ...optionalColumn(
        includeBaseTestRunId,
        "baseTestRunId",
        (testRun) => testRun.baseTestRunId,
      ),
      ...optionalColumn(includeDiffCount, "diffCount", (testRun) =>
        testRun.diffCount?.toString(),
      ),
      ...optionalColumn(
        includeCheckIssueCounts,
        "checkWarningCount",
        (testRun) => testRun.checkWarningCount?.toString(),
      ),
      ...optionalColumn(
        includeCheckIssueCounts,
        "checkFailureCount",
        (testRun) => testRun.checkFailureCount?.toString(),
      ),
      ...optionalColumn(includeDurationSeconds, "durationSeconds", (testRun) =>
        testRun.durationSeconds?.toString(),
      ),
    ];

    console.log(columns.map((column) => column.header).join("\t"));
    for (const testRun of testRuns) {
      console.log(columns.map((column) => column.value(testRun)).join("\t"));
    }
  }

  if (testRuns.length === 0 && (offset ?? 0) === 0) {
    const filtered =
      status != null ||
      withDiffsOnly === true ||
      withCheckIssuesOnly === true ||
      createdSince != null ||
      createdUntil != null;
    const message = describeNoTestRuns({ prNumber, baseTestRuns, filtered });
    // Only an unfiltered empty list suggests the wrong project, matching the
    // get_test_runs MCP tool.
    logNotice(
      filtered || prNumber != null
        ? message
        : await appendProjectSelectionHint(message, client, project),
    );
  }
  logResponseNotes(response);
};

const optionalColumn = (
  included: boolean | undefined,
  header: string,
  value: (testRun: TestRunListItem) => string | undefined,
): Column[] =>
  included ? [{ header, value: (testRun) => value(testRun) ?? "" }] : [];

const describeNoTestRuns = ({
  prNumber,
  baseTestRuns,
  filtered,
}: {
  prNumber: string | undefined;
  baseTestRuns: boolean | undefined;
  filtered: boolean;
}): string => {
  const items =
    prNumber != null
      ? `test runs for pull request ${prNumber}`
      : baseTestRuns
        ? "base test runs"
        : "pull request test runs";
  return `No ${items}${filtered ? " matching the filters" : ""} found for this project.`;
};

export const testRunsCommand: CommandModule<unknown, Options> = {
  command: "test-runs",
  describe:
    "Get the list of pull request test runs for a given project, newest first (default: limit to 100 test runs). " +
    "Alternatively, lists base test runs if --baseTestRuns is set. " +
    "Outputs a TSV table with columns id, createdAt, status, commitSha, prNumber plus the requested additional columns.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    project: {
      string: true,
      description:
        "The project to list test runs for (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s).",
    },
    prNumber: {
      string: true,
      conflicts: "baseTestRuns",
      description:
        "Output only test runs for this pull/merge request number, e.g. '123'.",
    },
    baseTestRuns: {
      boolean: true,
      description:
        "Output base test runs instead of the head test runs associated with pull requests.",
    },
    latestPerPullRequest: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Output only the newest test run of each pull request. Not accepted alongside --baseTestRuns, since base test runs aren't associated with a pull request.",
    },
    status: {
      string: true,
      description:
        "Output only test runs with one of these comma-separated statuses: PreProcessing, Scheduled, Running, Partial, PostProcessing, Success, Failure, ExecutionError, Aborted, Skipped. Failure means the run found differences, Success that it found none.",
    },
    withDiffsOnly: {
      boolean: true,
      conflicts: "status",
      description: "Output only test runs that found differences.",
    },
    withCheckIssuesOnly: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Output only test runs where a builtin check failed or warned.",
    },
    checkIds: {
      string: true,
      implies: "withCheckIssuesOnly",
      description: `With --withCheckIssuesOnly, consider only these comma-separated builtin checks: ${BUILTIN_CHECK_IDS.join(", ")}.`,
    },
    createdSince: {
      string: true,
      description:
        "Output only test runs created at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    createdUntil: {
      string: true,
      description:
        "Output only test runs created at or before this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    includeBaseTestRunId: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Add a baseTestRunId column with the test run this one was compared against (empty when it had nothing to compare against). Not accepted alongside --baseTestRuns, since a base test run has no base of its own.",
    },
    includeDiffCount: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Add a diffCount column with the number of differences the run found. Present only for runs in status Success or Failure. Not accepted alongside --baseTestRuns, since a base test run has no diffs of its own.",
    },
    includeCheckIssueCounts: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Add checkWarningCount and checkFailureCount columns: failures need acknowledgement, warnings don't. Not accepted alongside --baseTestRuns, since a base test run has no checks of its own.",
    },
    includeDurationSeconds: {
      boolean: true,
      conflicts: "baseTestRuns",
      description:
        "Add a durationSeconds column with how long the run spent running, in seconds. Not accepted alongside --baseTestRuns, since a base test run replays sessions in batches as pull requests need them, so has no single running duration.",
    },
    limit: {
      number: true,
      description: `Maximum number of test runs to return (1-${MAX_TEST_RUNS_LIMIT}, or 1-${MAX_TEST_RUNS_LIMIT_WITH_JSON_FIELDS} with --includeBaseTestRunId or --includeDiffCount). Defaults to 100.`,
      coerce: (value: number | undefined): number | undefined => {
        if (value == null) {
          return value;
        }
        if (
          !Number.isInteger(value) ||
          value < 1 ||
          value > MAX_TEST_RUNS_LIMIT
        ) {
          throw new Error(
            `--limit must be an integer between 1 and ${MAX_TEST_RUNS_LIMIT}.`,
          );
        }
        return value;
      },
    },
    offset: {
      number: true,
      description:
        "Skip this many matching test runs before returning results, for pagination.",
      coerce: (value: number | undefined): number | undefined => {
        if (value == null) {
          return value;
        }
        if (!Number.isInteger(value) || value < 0) {
          throw new Error("--offset must be a non-negative integer.");
        }
        return value;
      },
    },
  },
  handler: wrapHandler(handler),
};
