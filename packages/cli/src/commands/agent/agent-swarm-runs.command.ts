import {
  type AgentSwarmRunListItem,
  createClientWithOAuth,
  getAgentSwarmRuns,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { logResponseNotes } from "./response-notes.utils";

// Mirrors of the server-side MAX_AGENT_SWARM_RUNS_LIMIT and
// MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS (webapp-backend's
// agent-swarm-runs.types.ts), as client-side pre-checks — keep in sync.
const MAX_AGENT_SWARM_RUNS_LIMIT = 1000;
const MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS = 25;

// Mirrors the server-side AGENTIC_SESSION_GENERATION_RUN_STATUSES
// (@alwaysmeticulous/database-entities, which a public package can't depend
// on), for the --status description only; the server validates them — keep in
// sync.
const AGENT_SWARM_RUN_STATUSES = [
  "scheduled",
  "running",
  "succeeded",
  "failed",
  "timedOut",
  "cancelled",
];

const COUNT_COLUMNS = [
  "total",
  "pass",
  "fail",
  "blocked",
  "skipped",
  "running",
  "notStarted",
] as const;

interface Options {
  apiToken?: string | null | undefined;
  project?: string | undefined;
  prNumber?: string | undefined;
  status?: string | undefined;
  createdSince?: string | undefined;
  createdUntil?: string | undefined;
  includeCounts?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

interface Column {
  header: string;
  value: (run: AgentSwarmRunListItem) => string;
}

const handler = async ({
  apiToken,
  project,
  prNumber,
  status,
  createdSince,
  createdUntil,
  includeCounts,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  if (
    includeCounts &&
    limit != null &&
    limit > MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS
  ) {
    throw new Error(
      `--limit must be at most ${MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS} with --includeCounts.`,
    );
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getAgentSwarmRuns(client, {
    project,
    prNumber,
    status,
    createdSince,
    createdUntil,
    includeCounts,
    limit,
    offset,
  });
  const { swarmRuns } = response;

  if (json) {
    printJson(swarmRuns);
  } else if (swarmRuns.length > 0) {
    const columns: Column[] = [
      { header: "swarmRunId", value: (run) => run.swarmRunId },
      { header: "createdAt", value: (run) => run.createdAt },
      { header: "status", value: (run) => run.status },
      { header: "commitSha", value: (run) => run.commitSha },
      { header: "prNumber", value: (run) => run.prNumber ?? "" },
      ...(includeCounts
        ? COUNT_COLUMNS.map(
            (header): Column => ({
              header,
              value: (run) => run[header]?.toString() ?? "",
            }),
          )
        : []),
    ];

    console.log(columns.map((column) => column.header).join("\t"));
    for (const run of swarmRuns) {
      console.log(columns.map((column) => column.value(run)).join("\t"));
    }
  }

  if (swarmRuns.length === 0 && (offset ?? 0) === 0) {
    const filtered =
      status != null || createdSince != null || createdUntil != null;
    const message = `No Agent swarm runs${
      prNumber != null ? ` for pull request ${prNumber}` : ""
    }${filtered ? " matching the filters" : ""} found for this project.`;
    // Only an unfiltered empty list suggests the wrong project, matching the
    // get_agent_swarm_runs MCP tool.
    logNotice(
      filtered || prNumber != null
        ? message
        : await appendProjectSelectionHint(message, client, project),
    );
  }
  logResponseNotes(response);
};

export const agentSwarmRunsCommand: CommandModule<unknown, Options> = {
  command: "agent-swarm-runs",
  describe:
    "Get the list of Agent swarm runs for a given project, newest first (default: limit to 100 runs). " +
    "Agent swarm is Meticulous's hosted agent that explores a pull request's build in a browser and reports pass/fail/blocked test flows. " +
    "Outputs a TSV table with columns swarmRunId, createdAt, status, commitSha, prNumber plus the requested additional columns. " +
    "A succeeded run can still contain failed cases: pass its swarmRunId to agent agent-swarm-run --swarmRunId for the run's cases.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    project: {
      string: true,
      description:
        "The project to list Agent swarm runs for (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s).",
    },
    prNumber: {
      string: true,
      description:
        "Output only Agent swarm runs for this pull/merge request number, e.g. '123', across all of its commits.",
    },
    status: {
      string: true,
      description: `Output only Agent swarm runs with one of these comma-separated statuses: ${AGENT_SWARM_RUN_STATUSES.join(", ")}. succeeded means the run reported its results, whatever its cases found.`,
    },
    createdSince: {
      string: true,
      description:
        "Output only Agent swarm runs created at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    createdUntil: {
      string: true,
      description:
        "Output only Agent swarm runs created at or before this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    includeCounts: {
      boolean: true,
      description:
        "Add total, pass, fail, blocked, skipped, running and notStarted columns with the number of the run's cases in each status. Present only for a succeeded run.",
    },
    limit: {
      number: true,
      description: `Maximum number of Agent swarm runs to return (1-${MAX_AGENT_SWARM_RUNS_LIMIT}, or 1-${MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS} with --includeCounts). Defaults to 100, or ${MAX_AGENT_SWARM_RUNS_LIMIT_WITH_COUNTS} with --includeCounts.`,
      coerce: (value: number | undefined): number | undefined => {
        if (value == null) {
          return value;
        }
        if (
          !Number.isInteger(value) ||
          value < 1 ||
          value > MAX_AGENT_SWARM_RUNS_LIMIT
        ) {
          throw new Error(
            `--limit must be an integer between 1 and ${MAX_AGENT_SWARM_RUNS_LIMIT}.`,
          );
        }
        return value;
      },
    },
    offset: {
      number: true,
      description:
        "Skip this many matching Agent swarm runs before returning results, for pagination.",
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
