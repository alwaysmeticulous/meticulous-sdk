import {
  createClientWithOAuth,
  getSessions,
  SESSIONS_ORDER_BY_FIELDS,
  type SessionListItem,
  type SessionsOrderByField,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { logResponseNotes } from "./response-notes.utils";

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
  /**
   * `--selectedSet` takes its date optionally, so yargs yields `""` for the
   * bare flag (the current set) and the date string when one was given.
   *
   * `boolean` is in the type because yargs produces one for `--no-selectedSet`
   * whatever `string: true` says, and a type that denied it would just move the
   * bug out of sight. {@link normalizeSelectedSet} is where it stops.
   */
  selectedSet?: string | boolean | undefined;
  includeDurationSeconds?: boolean | undefined;
  includeNumberUserEvents?: boolean | undefined;
  includeNumberUrlsVisited?: boolean | undefined;
  includeStartUrl?: boolean | undefined;
  includeAbandonedReason?: boolean | undefined;
  includeSelectedSince?: boolean | undefined;
  includeAdditionalCoverage?: boolean | undefined;
  orderBy?: SessionsOrderByField | undefined;
  order?: "asc" | "desc" | undefined;
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
  selectedSet,
  includeDurationSeconds,
  includeNumberUserEvents,
  includeNumberUrlsVisited,
  includeStartUrl,
  includeAbandonedReason,
  includeSelectedSince,
  includeAdditionalCoverage,
  orderBy,
  order,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  const selectedSetValue = normalizeSelectedSet(selectedSet);
  // Caught here rather than server-side so the message names the flags.
  if (includeSelectedSince && selectedSetValue == null) {
    throw new Error(
      "--includeSelectedSince requires --selectedSet, which decides the selected set the entrance time is measured against.",
    );
  }
  if (orderBy === "rank" && selectedSetValue == null) {
    throw new Error(
      "--orderBy=rank requires --selectedSet, since the rank is a property of a selected-set entry rather than of a session.",
    );
  }
  if (orderBy === "selectedSince" && selectedSetValue == null) {
    throw new Error(
      "--orderBy=selectedSince requires --selectedSet, which decides the selected set the entrance time is measured against.",
    );
  }
  if (includeAdditionalCoverage && selectedSetValue == null) {
    throw new Error(
      "--includeAdditionalCoverage requires --selectedSet, which decides the selected set the coverage was added to.",
    );
  }
  if (orderBy === "additionalCoverage" && selectedSetValue == null) {
    throw new Error(
      "--orderBy=additionalCoverage requires --selectedSet, which decides the selected set the coverage was added to.",
    );
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `project` is a one-off override (resolved flexibly server-side); when
  // omitted, project-scoped tokens use their own project and OAuth tokens
  // fall back to the caller's stored default (`meticulous auth set-project`).
  const response = await getSessions(client, {
    project,
    createdSince,
    createdUntil,
    recordedSince,
    recordedUntil,
    recordedBy,
    excludeSyntheticSessions,
    visitedUrlFilter,
    selectedSet: selectedSetValue,
    includeDurationSeconds,
    includeNumberUserEvents,
    includeNumberUrlsVisited,
    includeStartUrl,
    includeAbandonedReason,
    includeSelectedSince,
    includeAdditionalCoverage,
    orderBy,
    order,
    limit,
    offset,
  });
  const { sessions } = response;

  if (json) {
    printJson(sessions);
  } else if (sessions.length > 0) {
    // Columns mirror the JSON attributes: `status` is dropped under
    // --excludeSyntheticSessions (every row is then original); `startUrl` and
    // the remaining columns are opt-in through their corresponding --include*
    // flags.
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
      ...(includeDurationSeconds
        ? [
            {
              header: "durationSeconds",
              value: (session: SessionListItem) =>
                String(session.durationSeconds ?? ""),
            },
          ]
        : []),
      ...(includeNumberUserEvents
        ? [
            {
              header: "numberUserEvents",
              value: (session: SessionListItem) =>
                String(session.numberUserEvents ?? ""),
            },
          ]
        : []),
      ...(includeNumberUrlsVisited
        ? [
            {
              header: "numberUrlsVisited",
              value: (session: SessionListItem) =>
                String(session.numberUrlsVisited ?? ""),
            },
          ]
        : []),
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
      ...(includeSelectedSince
        ? [
            {
              header: "selectedSince",
              value: (session: SessionListItem) => session.selectedSince ?? "",
            },
          ]
        : []),
      ...(includeAdditionalCoverage
        ? [
            {
              header: "additionalCoverage",
              value: (session: SessionListItem) =>
                session.additionalCoverage != null
                  ? String(session.additionalCoverage)
                  : "",
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
  if (sessions.length === 0 && (offset ?? 0) === 0) {
    logNotice(
      await appendProjectSelectionHint(
        "No recorded sessions found for this project.",
        client,
        project,
      ),
    );
    return;
  }
  // The paging notice is written by the backend, which knows whether another
  // page exists without counting the set, and relayed here verbatim — see
  // `agent.pagination.utils.ts`.
  logResponseNotes(response);
};

/**
 * Resolves what `--selectedSet` was actually asked for, across the spellings
 * yargs can produce for an option that takes its value optionally.
 *
 * `""` (the bare flag) and `"true"` both mean the live set, which the client
 * spells `"current"` on the wire. `--no-selectedSet` yields a real `false`
 * despite `string: true`, and `"false"` comes from `--selectedSet=false`; both
 * mean "not asked for". Left unhandled, every one of these but the bare flag
 * reached the server's ISO-8601 parser and came back a 400 — and neither
 * `"true"` nor `"false"` can ever be a valid date, so accepting them costs no
 * ambiguity. The MCP surface takes the same four readings via `optStrOrTrue`.
 */
const normalizeSelectedSet = (
  selectedSet: string | boolean | undefined,
): string | true | undefined => {
  if (selectedSet == null || selectedSet === false) {
    return undefined;
  }
  if (selectedSet === true) {
    return true;
  }
  // Case-insensitive to match the server-side parser, so the two layers agree
  // on what a value means rather than one passing through what the other
  // would have normalized.
  const lowered = selectedSet.trim().toLowerCase();
  if (lowered === "false") {
    return undefined;
  }
  if (lowered.length === 0 || lowered === "true") {
    return true;
  }
  return selectedSet;
};

export const sessionsCommand: CommandModule<unknown, Options> = {
  command: "sessions",
  describe:
    "Get the list of recently created sessions for a given project, newest first by default (default: limit to 100 sessions). " +
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
    selectedSet: {
      string: true,
      description:
        "Output only sessions in the project's selected set (the golden set Meticulous replays). Takes its value optionally: on its own it means the set as it stands now, and with an ISO-8601 date/datetime (e.g. '2026-07-01') the set as of that point (date-only means end of day).",
    },
    includeDurationSeconds: {
      boolean: true,
      description:
        "Add a durationSeconds column with the session's duration in seconds, computed from its first and last recorded user event with a timestamp. Empty for sessions where a duration couldn't be computed (e.g. recorded before this was tracked).",
    },
    includeNumberUserEvents: {
      boolean: true,
      description:
        "Add a numberUserEvents column with the number of recorded user events.",
    },
    includeNumberUrlsVisited: {
      boolean: true,
      description:
        "Add a numberUrlsVisited column with the number of recorded URL visits, including the initial URL and repeated visits.",
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
    includeSelectedSince: {
      boolean: true,
      description:
        "Add a selectedSince column with when the session entered the selected set and stayed in it, i.e. the session-selection cycle that added it. Only accepted alongside --selectedSet, which decides the set the entrance time is measured against. A session whose entrance can't be dated gets a fixed sentinel instead of a timestamp: 'unknown:added-after-last-cycle', 'unknown:before-selection-history', 'unknown:scan-budget-exhausted'.",
    },
    includeAdditionalCoverage: {
      boolean: true,
      description:
        "Add an additionalCoverage column with the coverage the session added over everything picked before it. Only accepted alongside --selectedSet. The unit — original source lines, or raw bundle characters for a project whose replays have no mapped source coverage — is the same for every row and is named in a notice on stderr.",
    },
    orderBy: {
      string: true,
      choices: SESSIONS_ORDER_BY_FIELDS,
      description:
        "Order the output by this field (default createdAt). 'rank' is only valid in combination with --selectedSet and is the selected set's own greedy pick order (rankPosition, 1 = picked first, i.e. highest marginal coverage value at its pick step); 'selectedSince' is only valid in combination with --selectedSet and is the entrance time --includeSelectedSince reports; 'additionalCoverage' is only valid in combination with --selectedSet and is the marginal coverage --includeAdditionalCoverage reports.",
    },
    order: {
      string: true,
      choices: ["asc", "desc"],
      description:
        "Sort direction, overriding the default for the chosen --orderBy (descending for createdAt, selectedSince and additionalCoverage, ascending for rank).",
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
