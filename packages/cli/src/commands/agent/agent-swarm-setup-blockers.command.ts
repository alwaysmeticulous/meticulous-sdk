import {
  AGENTIC_RUN_SETUP_ISSUE_CATEGORIES,
  type AgentSwarmSetupBlockerCategory,
  type AgentSwarmSetupBlockerEntry,
  createClientWithOAuth,
  getAgentSwarmSetupBlockers,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { logResponseNotes } from "./response-notes.utils";

// Mirrors of the server-side MAX_AGENT_SWARM_SETUP_BLOCKERS_LIMIT and lookback
// defaults (webapp-backend's agent-swarm-setup-blockers.types.ts), as
// client-side pre-checks and descriptions — keep in sync.
const MAX_AGENT_SWARM_SETUP_BLOCKERS_LIMIT = 500;
const DEFAULT_AGENT_SWARM_SETUP_BLOCKERS_LOOKBACK_DAYS = 30;
const MAX_AGENT_SWARM_SETUP_BLOCKERS_LOOKBACK_DAYS = 365;

const COLUMNS = [
  "createdAt",
  "swarmRunId",
  "caseIndex",
  "caseId",
  "commitSha",
  "category",
  "blockedBy",
  "caseTitle",
  "summary",
  "evidence",
  "suggestedFix",
  "fallbackOutcome",
] as const satisfies readonly (keyof AgentSwarmSetupBlockerEntry)[];

interface Options {
  apiToken?: string | null | undefined;
  project?: string | undefined;
  since?: string | undefined;
  category?: AgentSwarmSetupBlockerCategory | undefined;
  runId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

// A TSV cell can't hold the tabs or newlines free text may carry.
const toCell = (value: string | number | null): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const handler = async ({
  apiToken,
  project,
  since,
  category,
  runId,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getAgentSwarmSetupBlockers(client, {
    project,
    since,
    category,
    runId,
    limit,
    offset,
  });
  const { notes: _notes, ...body } = response;
  const { setupBlockers, counts } = body;

  if (json) {
    printJson(body);
  } else {
    logNotice(
      `Setup blockers since ${body.since} by category: ${counts
        .map(({ category: name, count }) => `${name} ${count}`)
        .join(", ")}.`,
    );
    if (setupBlockers.length > 0) {
      console.log(COLUMNS.join("\t"));
      for (const blocker of setupBlockers) {
        console.log(
          COLUMNS.map((column) => toCell(blocker[column])).join("\t"),
        );
      }
    }
  }

  if (setupBlockers.length === 0 && (offset ?? 0) === 0) {
    const filtered = since != null || category != null || runId != null;
    const message = `No Agent swarm setup blockers${
      filtered ? " matching the filters" : ""
    } found for this project.`;
    logNotice(
      filtered
        ? message
        : await appendProjectSelectionHint(message, client, project),
    );
  }
  logResponseNotes(response);
};

export const agentSwarmSetupBlockersCommand: CommandModule<unknown, Options> = {
  command: "agent-swarm-setup-blockers",
  describe:
    `Get the list of Agent swarm setup blockers for a given project, newest first (default: limit to 100 setup blockers from the last ${DEFAULT_AGENT_SWARM_SETUP_BLOCKERS_LOOKBACK_DAYS} days). ` +
    "A setup blocker is a test flow that an Agent swarm run against a live backend could not verify because of the project's test environment — missing test data, test-user permissions, a disabled feature flag, authentication, an unhealthy backend or an unavailable external dependency — rather than because of the app's code. " +
    `Outputs a TSV table with columns ${COLUMNS.join(", ")}, plus each category's number of matching setup blockers (across all pages) on stderr. ` +
    "fallbackOutcome is how the flow's automatic retry with mocked API responses ended (pass, fail, blocked, skipped or unreported), empty when it was not retried; a mocked pass verified the frontend only. " +
    "Use the suggested fixes to improve the test environment, and pass a swarmRunId and caseIndex to agent agent-swarm-run-case for the case's full steps.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    project: {
      string: true,
      description:
        "The project to list setup blockers for (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s).",
    },
    since: {
      string: true,
      description: `Output only setup blockers recorded at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime), at most ${MAX_AGENT_SWARM_SETUP_BLOCKERS_LOOKBACK_DAYS} days ago. Defaults to ${DEFAULT_AGENT_SWARM_SETUP_BLOCKERS_LOOKBACK_DAYS} days ago.`,
    },
    category: {
      string: true,
      choices: AGENTIC_RUN_SETUP_ISSUE_CATEGORIES,
      description: `Output only setup blockers in this category: ${AGENTIC_RUN_SETUP_ISSUE_CATEGORIES.join(", ")}.`,
    },
    runId: {
      string: true,
      description:
        "Output only setup blockers from this Agent swarm run, e.g. a swarmRunId from agent agent-swarm-runs.",
    },
    limit: {
      number: true,
      description: `Maximum number of setup blockers to return (1-${MAX_AGENT_SWARM_SETUP_BLOCKERS_LIMIT}). Defaults to 100.`,
      coerce: (value: number | undefined): number | undefined => {
        if (value == null) {
          return value;
        }
        if (
          !Number.isInteger(value) ||
          value < 1 ||
          value > MAX_AGENT_SWARM_SETUP_BLOCKERS_LIMIT
        ) {
          throw new Error(
            `--limit must be an integer between 1 and ${MAX_AGENT_SWARM_SETUP_BLOCKERS_LIMIT}.`,
          );
        }
        return value;
      },
    },
    offset: {
      number: true,
      description:
        "Skip this many matching setup blockers before returning results, for pagination.",
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
