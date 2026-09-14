import {
  createClientWithOAuth,
  getProjectDailyStats,
  getTestRunEventStats,
  getTestRunStats,
  type MeticulousClient,
  type ProjectDailyStatsItem,
  type TestRunEventStatsItem,
  type TestRunStatsItem,
} from "@alwaysmeticulous/client";
import { TEST_RUN_EVENT_TYPES } from "@alwaysmeticulous/api";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule, Options as YargsOptions } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { coerceLimit, coerceOffset } from "./paging-options.utils";
import { logResponseNotes } from "./response-notes.utils";

interface Options {
  apiToken?: string | null;
  project?: string;
  since?: string;
  until?: string;
  testRunIds?: string;
  prNumbers?: string;
  commitShas?: string;
  eventTypes?: string;
  cursor?: string;
  limit?: number;
  offset?: number;
  json: boolean;
}

interface StatsResponse<Row> {
  data: Row[];
  pagination: {
    limit: number;
    offset: number;
    totalCount: number | null;
    nextOffset: number | null;
    nextCursor?: string | null;
  };
  /** Backend-written remarks, e.g. which page these rows are. */
  notes?: string[];
}

interface StatsCommandConfig<Row extends object> {
  command: string;
  description: string;
  scopeRequirement: string;
  columns: ReadonlyArray<keyof Row>;
  builder: Record<string, YargsOptions>;
  fetch: (
    client: MeticulousClient,
    options: Options,
  ) => Promise<StatsResponse<Row>>;
  emptyMessage: string;
}

const testRunColumns: ReadonlyArray<keyof TestRunStatsItem> = [
  "testRunId",
  "baseCommitSha",
  "headCommitSha",
  "executionSha",
  "prNumber",
  "prAuthor",
  "prAuthorBitbucketAccountId",
  "prCoveragePercentage",
  "prStatus",
  "sessionsReplayedCount",
  "diffCount",
  "diffApprovedCount",
  "diffRejectedCount",
  "diffIgnoredCount",
  "diffCountChangeFromPreviousCommit",
  "diffApprovers",
  "userViewCount",
  "userDiffReportCount",
  "meticulousCommentPostedOnPr",
  "runTimestamp",
];

const projectDailyColumns: ReadonlyArray<keyof ProjectDailyStatsItem> = [
  "startDatetime",
  "endDatetime",
  "testRunCount",
  "runTimeSeconds",
  "prRunTimeSeconds",
  "coverage",
  "prs",
  "bugsPrevented",
  "prNumbersWithPotentialBugs",
];

const eventColumns: ReadonlyArray<keyof TestRunEventStatsItem> = [
  "eventType",
  "timestamp",
  "testRunId",
  "testRun",
  "prNumber",
  "prAuthor",
  "prAuthorBitbucketAccountId",
  "actor",
  "diffReportType",
  "diffHash",
];

const createStatsCommand = <Row extends object>({
  command,
  description,
  scopeRequirement,
  columns,
  builder,
  fetch,
  emptyMessage,
}: StatsCommandConfig<Row>): CommandModule<unknown, Options> => ({
  command,
  describe:
    `Get the list of ${description} for a given project. ` +
    `${scopeRequirement} ` +
    `Outputs a TSV table with columns ${columns.join(", ")}.`,
  builder,
  handler: wrapHandler(async (options: Options): Promise<void> => {
    const client = await createClientWithOAuth({
      apiToken: options.apiToken,
      enableOAuthLogin: true,
    });
    const response = await fetch(client, options);
    await printStatsResponse({
      response,
      columns,
      json: options.json,
      client,
      project: options.project,
      emptyMessage,
    });
  }),
});

const commonBuilder = (
  scope: string,
  items: string,
  maxLimit: number,
  defaultLimit: number,
  { sinceIsTheOnlyScope = false }: { sinceIsTheOnlyScope?: boolean } = {},
): Record<string, YargsOptions> => ({
  apiToken: { string: true, description: "Meticulous API token." },
  project: {
    string: true,
    description: `The project to list ${scope} for (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project.`,
  },
  since: {
    string: true,
    // yargs can only express "always required", so a command that also accepts
    // identifiers states the disjunction in its description instead.
    demandOption: sinceIsTheOnlyScope,
    description: `Output only ${items} at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).${
      sinceIsTheOnlyScope
        ? ""
        : " Required unless at least one identifier is given."
    }`,
  },
  until: {
    string: true,
    description: `Output only ${items} at or before this date/time (ISO-8601, e.g. '2026-07-31' or a full datetime). Defaults to now.`,
  },
  limit: {
    number: true,
    description: `Maximum number of ${items} to return (1-${maxLimit}). Defaults to ${defaultLimit}.`,
    coerce: coerceLimit(maxLimit),
  },
  offset: {
    number: true,
    description: `Skip this many matching ${items} before returning results, for pagination.`,
    coerce: coerceOffset,
  },
});

const printStatsResponse = async <Row extends object>({
  response,
  columns,
  json,
  client,
  project,
  emptyMessage,
}: {
  response: StatsResponse<Row>;
  columns: ReadonlyArray<keyof Row>;
  json: boolean;
  client: MeticulousClient;
  project: string | undefined;
  emptyMessage: string;
}): Promise<void> => {
  // Bare row list, like `sessions` and the coverage commands: stdout carries
  // only the rows, so `--json | jq` needs no unwrapping step. Pagination —
  // including the opaque cursor — goes to stderr below, which `--json` does not
  // suppress.
  if (json) {
    printJson(response.data);
  } else if (response.data.length > 0) {
    console.log(columns.join("\t"));
    for (const row of response.data) {
      console.log(columns.map((column) => formatCell(row[column])).join("\t"));
    }
  }

  if (response.data.length === 0 && (response.pagination.offset ?? 0) === 0) {
    logNotice(await appendProjectSelectionHint(emptyMessage, client, project));
    return;
  }

  // Written by the backend, which knows the exact next offset/cursor, and
  // relayed verbatim — see `agent.pagination.utils.ts`.
  logResponseNotes(response);
};

const formatCell = (value: unknown): string => {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString();
  }
  return JSON.stringify(value) ?? "";
};

const requiredOption = (value: string | undefined, name: string): string => {
  if (value == null) {
    throw new Error(`--${name} is required.`);
  }
  return value;
};

export const testRunStatsCommand = createStatsCommand<TestRunStatsItem>({
  command: "test-run-stats",
  description: "reporting statistics for test runs",
  scopeRequirement:
    "Requires either --since (--until defaults to now) or at least one of --testRunIds, --prNumbers and --commitShas.",
  columns: testRunColumns,
  builder: {
    ...commonBuilder("test run stats", "test runs", 100, 100),
    testRunIds: {
      string: true,
      description: "Output only these comma-separated test run IDs.",
    },
    prNumbers: {
      string: true,
      description: "Output only these comma-separated pull request numbers.",
    },
    commitShas: {
      string: true,
      description: "Output only these comma-separated commit SHAs.",
    },
  },
  fetch: getTestRunStats,
  emptyMessage: "No test run stats found for this project.",
});

export const projectDailyStatsCommand =
  createStatsCommand<ProjectDailyStatsItem>({
    command: "project-daily-stats",
    description: "daily reporting statistics",
    scopeRequirement: "--until defaults to now.",
    columns: projectDailyColumns,
    builder: {
      ...commonBuilder("daily stats", "days", 366, 100, {
        sinceIsTheOnlyScope: true,
      }),
    },
    fetch: (client, options) =>
      getProjectDailyStats(client, {
        ...options,
        since: requiredOption(options.since, "since"),
      }),
    emptyMessage: "No daily project stats found for this project.",
  });

export const testRunEventStatsCommand =
  createStatsCommand<TestRunEventStatsItem>({
    command: "test-run-event-stats",
    description: "reporting test-run events",
    scopeRequirement:
      "Requires either --since (--until defaults to now) or at least one of --testRunIds and --prNumbers; --eventTypes and --cursor do not satisfy this on their own.",
    columns: eventColumns,
    builder: {
      ...commonBuilder("test-run event stats", "test-run events", 500, 100),
      testRunIds: {
        string: true,
        description:
          "Output only test-run events for these comma-separated test run IDs.",
      },
      prNumbers: {
        string: true,
        description:
          "Output only test-run events for these comma-separated pull request numbers.",
      },
      eventTypes: {
        string: true,
        description: `Output only these comma-separated event types: ${TEST_RUN_EVENT_TYPES.join(", ")}.`,
      },
      cursor: {
        string: true,
        description:
          "Continue after this opaque cursor from pagination.nextCursor. Cannot be combined with a non-zero --offset.",
      },
    },
    fetch: getTestRunEventStats,
    emptyMessage: "No test-run event stats found for this project.",
  });
