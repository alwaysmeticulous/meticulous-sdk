import {
  createClientWithOAuth,
  getSessions,
  type SessionListItem,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

// Mirror of the server-side MAX_SESSIONS_LIMIT (webapp-backend's
// agent.types.ts) — public_packages/cli can't depend on webapp-backend, so
// this is a client-side pre-check; keep the two values in sync.
const MAX_SESSIONS_LIMIT = 1000;
// Mirror of the server-side DEFAULT_SESSIONS_LIMIT, used only to hint (on
// stderr) that a full page likely has more behind it — the server applies its
// own default. Keep in sync with webapp-backend's agent.types.ts.
const DEFAULT_SESSIONS_LIMIT = 100;

interface Options {
  apiToken?: string | null | undefined;
  project?: string | undefined;
  createdSince?: string | undefined;
  createdUntil?: string | undefined;
  recordedSince?: string | undefined;
  recordedUntil?: string | undefined;
  recordedBy?: string | undefined;
  excludeSyntheticSessions?: boolean | undefined;
  visitedUrlFilter?: string | undefined;
  includeStartUrl?: boolean | undefined;
  includeAbandonedReason?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  project,
  createdSince,
  createdUntil,
  recordedSince,
  recordedUntil,
  recordedBy,
  excludeSyntheticSessions,
  visitedUrlFilter,
  includeStartUrl,
  includeAbandonedReason,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `project` is a one-off override (resolved flexibly server-side); when
  // omitted, project-scoped tokens use their own project and OAuth tokens
  // fall back to the caller's stored default (`meticulous auth set-project`).
  const { sessions } = await getSessions(client, {
    project,
    createdSince,
    createdUntil,
    recordedSince,
    recordedUntil,
    recordedBy,
    excludeSyntheticSessions,
    visitedUrlFilter,
    includeStartUrl,
    includeAbandonedReason,
    limit,
    offset,
  });

  if (json) {
    printJson(sessions);
  } else if (sessions.length > 0) {
    // Columns mirror the JSON attributes: `status` is dropped under
    // --excludeSyntheticSessions (every row is then original); `startUrl` and
    // `abandonedReason` are opt-in via --includeStartUrl / --includeAbandonedReason.
    const columns: Array<{
      header: string;
      value: (session: SessionListItem) => string;
    }> = [
      { header: "id", value: (session) => session.id },
      { header: "createdAt", value: (session) => session.createdAt },
      { header: "recordedAt", value: (session) => session.recordedAt },
      { header: "recordedBy", value: (session) => session.recordedBy ?? "" },
      ...(excludeSyntheticSessions
        ? []
        : [
            {
              header: "status",
              value: (session: SessionListItem) => session.status ?? "",
            },
          ]),
      ...(includeStartUrl
        ? [
            {
              header: "startUrl",
              value: (session: SessionListItem) => session.startUrl ?? "",
            },
          ]
        : []),
      ...(includeAbandonedReason
        ? [
            {
              header: "abandonedReason",
              value: (session: SessionListItem) =>
                session.abandonedReason ?? "",
            },
          ]
        : []),
    ];

    console.log(columns.map((column) => column.header).join("\t"));
    for (const session of sessions) {
      console.log(columns.map((column) => column.value(session)).join("\t"));
    }
  }

  // Count on stderr regardless of --json (stdout stays clean for piping), so a
  // full page (== limit, likely more via --offset) is easy to tell from a
  // partial one.
  if (sessions.length === 0) {
    logNotice("No recorded sessions found for this project.");
    return;
  }
  const effectiveLimit = limit ?? DEFAULT_SESSIONS_LIMIT;
  logNotice(
    `${sessions.length} session(s)${
      sessions.length >= effectiveLimit
        ? " — limit reached, more may be available via --offset"
        : ""
    }.`,
  );
};

export const sessionsCommand: CommandModule<unknown, Options> = {
  command: "sessions",
  describe:
    "Get the list of recently created sessions for a given project, newest first (default: limit to 100 sessions). " +
    "Outputs a TSV table with columns id, createdAt, recordedAt, recordedBy, status plus the requested additional columns. " +
    "Useful to find the id of a session you just recorded.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    project: {
      string: true,
      description:
        "The project to list sessions for (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project.",
    },
    createdSince: {
      string: true,
      description:
        "Output only sessions created at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    createdUntil: {
      string: true,
      description:
        "Output only sessions created at or before this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    recordedSince: {
      string: true,
      description:
        "Output only sessions recorded (originally) at or after this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    recordedUntil: {
      string: true,
      description:
        "Output only sessions recorded (originally) at or before this date/time (ISO-8601, e.g. '2026-07-01' or a full datetime).",
    },
    recordedBy: {
      string: true,
      description:
        "Output only sessions recorded by this identity (matches either the recording user's email or user id).",
    },
    excludeSyntheticSessions: {
      boolean: true,
      description:
        "Output only original sessions (drop sessions produced by patching, slicing, or mutation); also omits the status column, since every row is then original.",
    },
    visitedUrlFilter: {
      string: true,
      description:
        "Output only sessions that visited a URL matching this glob (only '*' is a wildcard, matching any run of characters; everything else — including '?', '.', '/' — is literal). Matched against every visited URL and the startUrl, e.g. '*/checkout*'.",
    },
    includeStartUrl: {
      boolean: true,
      description: "Add a startUrl column with the session's start URL.",
    },
    includeAbandonedReason: {
      boolean: true,
      description:
        "Add an abandonedReason column with why the recorder gave up on the session, for sessions that were abandoned.",
    },
    limit: {
      number: true,
      description: `Maximum number of sessions to return (1-${MAX_SESSIONS_LIMIT}). Defaults to 100.`,
      coerce: (value: number | undefined): number | undefined => {
        if (value == null) {
          return value;
        }
        if (
          !Number.isInteger(value) ||
          value < 1 ||
          value > MAX_SESSIONS_LIMIT
        ) {
          throw new Error(
            `--limit must be an integer between 1 and ${MAX_SESSIONS_LIMIT}.`,
          );
        }
        return value;
      },
    },
    offset: {
      number: true,
      description:
        "Skip this many matching sessions before returning results, for pagination.",
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
