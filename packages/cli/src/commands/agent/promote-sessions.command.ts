import {
  createClientWithOAuth,
  promoteSessions,
  type MeticulousClient,
  type PromoteSessionsResponse,
} from "@alwaysmeticulous/client";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { errorResponseBody } from "../../utils/error-response-body";
import { requireIdArgument } from "./argument-validation.utils";
import { logResponseNotes } from "./response-notes.utils";

/**
 * The backend's response-body `reason`s marking a request it declines as a
 * caller mistake rather than a fault, matched instead of the prose so a genuine
 * failure still reaches the generic error path and Sentry. Kept in step with
 * `PromoteSessionsFailureReason` in
 * `packages/webapp-backend/src/agent/session-promotion/promote-sessions.errors.ts`.
 */
const PROMOTION_REJECTION_REASONS = new Set([
  "not-an-agent-session-run",
  "test-run-not-finished",
  "no-sessions-requested",
  "session-not-in-test-run",
  "session-not-replayed",
  "session-banned",
  "session-not-in-project",
  "session-ineligible",
  "auto-selection-disabled",
  "no-base-run-for-commit",
  "execution-sha-mismatch",
  "base-run-not-finished",
  "promotion-in-progress",
  "base-run-incomplete",
  "base-run-missing-repo-parse",
  "too-many-sessions",
  "promotion-cap-reached",
]);

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string;
  sessionIds?: string | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  testRunId: testRunId_,
  sessionIds: sessionIds_,
  json,
}: Options): Promise<void> => {
  const testRunId = requireIdArgument("testRunId", testRunId_);
  const sessionIds = parseSessionIds(sessionIds_);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await requestPromotion(client, testRunId, sessionIds);

  if (json) {
    printJson(response);
  } else {
    printKeyValueLines(response);
  }
  logResponseNotes(response);
};

// Session IDs never contain commas, so a comma split is unambiguous (same as
// `trigger-test-run --sessionIds`).
const parseSessionIds = (
  sessionIds: string | undefined,
): string[] | undefined => {
  if (sessionIds == null) {
    return undefined;
  }
  const parsed = sessionIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (parsed.length === 0) {
    throw new CliUserError(
      "--sessionIds was provided but contains no session IDs. Omit it to promote every session of the test run.",
    );
  }
  return parsed;
};

const requestPromotion = async (
  client: MeticulousClient,
  testRunId: string,
  sessionIds: string[] | undefined,
): Promise<PromoteSessionsResponse> => {
  try {
    return await promoteSessions(client, testRunId, sessionIds);
  } catch (error) {
    const body = errorResponseBody(error);
    if (
      body?.reason != null &&
      PROMOTION_REJECTION_REASONS.has(body.reason) &&
      body.message != null
    ) {
      throw new CliUserError(body.message);
    }
    throw error;
  }
};

const printKeyValueLines = ({
  promotedSessionIds,
  alreadySelectedSessionIds,
  updatedBaseTestRunId,
}: PromoteSessionsResponse): void => {
  console.log(`promotedSessionIds:\t${promotedSessionIds.join(",")}`);
  console.log(
    `alreadySelectedSessionIds:\t${alreadySelectedSessionIds.join(",")}`,
  );
  console.log(`updatedBaseTestRunId:\t${updatedBaseTestRunId ?? ""}`);
};

export const promoteSessionsCommand: CommandModule<unknown, Options> = {
  command: "promote-sessions",
  describe:
    "Add sessions you recorded to the project's selected set now, instead of waiting for the next session selection to pick them up. Pass the test run you triggered over them (agent trigger-test-run --sessionIds) against your default branch's HEAD; every session promoted must have replayed in it. That commit needs a finished base run on the same build that has replayed its whole selected set (see 'agent complete-base-run'). Outputs promotedSessionIds, alreadySelectedSessionIds and updatedBaseTestRunId, one per line; a notice on stderr says how to read the promoted sessions' coverage straight away. At most 20 sessions per call, and at most 10% of the project's configured selected-set size between two session selections (normally about daily).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      demandOption: true,
      description:
        "The test run you triggered over the sessions to promote (agent trigger-test-run --sessionIds). It must have finished.",
    },
    sessionIds: {
      string: true,
      description:
        "Comma-separated sessions to promote, a subset of the test run's sessions. Omit to promote all of them.",
    },
    json: {
      boolean: true,
      default: false,
      description: "Output the result as JSON instead of one field per line.",
    },
  },
  handler: wrapHandler(handler),
};
