import { existsSync } from "fs";
import { getSessions } from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS_WITH_TOKEN,
  printResult,
  repoRootFrom,
  writeWorkspaceJson,
} from "../shared/helper-options";
import { TRY_PATHS, TRY_WORKDIR, absoluteTryPath } from "../shared/try-paths";
import { createTryClient } from "../shared/try-client";
import { pollUntilSessionCount } from "./poll-sessions";

const MAX_SESSIONS_PAGE = 1000;

interface Options {
  cwd: string | undefined;
  json: boolean;
  apiToken: string | undefined;
  min: number;
  timeoutSeconds: number;
  intervalSeconds: number;
}

const handler = async (options: Options): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const { client } = createTryClient({ apiToken: options.apiToken, repoRoot });
  const result = await pollUntilSessionCount({
    min: options.min,
    timeoutSeconds: options.timeoutSeconds,
    intervalSeconds: options.intervalSeconds,
    listSessionIds: async () => {
      const { sessions } = await getSessions(client, {
        excludeSyntheticSessions: true,
        limit: MAX_SESSIONS_PAGE,
      });
      return sessions.map((session) => session.id);
    },
    onProgress: (count) =>
      logNotice(`${count}/${options.min} sessions ingested so far, waiting…`),
  });

  if (existsSync(absoluteTryPath(repoRoot, TRY_WORKDIR))) {
    writeWorkspaceJson(repoRoot, TRY_PATHS.sessions, result);
  }
  printResult(options.json, result, () => [
    result.reached
      ? `${result.count} sessions ingested (needed ${options.min}).`
      : `Timed out after ${result.waitedSeconds}s with ${result.count}/${options.min} sessions ingested.`,
  ]);
  if (!result.reached) {
    throw new CliUserError(
      `Only ${result.count} of ${options.min} sessions were ingested within ${options.timeoutSeconds}s.`,
      1,
      "warn",
    );
  }
};

export const waitForSessionsCommand: CommandModule<unknown, Options> = {
  command: "wait-for-sessions",
  describe:
    "Wait until the try project has at least --min ingested sessions and save their ids to .meticulous-try/sessions.json (exit code 1 on timeout)",
  builder: {
    ...HELPER_OPTIONS_WITH_TOKEN,
    min: {
      number: true,
      default: 1,
      description: "Number of ingested sessions to wait for",
    },
    timeoutSeconds: {
      number: true,
      default: 600,
      description: "Give up after this many seconds",
    },
    intervalSeconds: {
      number: true,
      default: 15,
      description: "Seconds between polls",
    },
  },
  handler: wrapHandler(handler),
};
