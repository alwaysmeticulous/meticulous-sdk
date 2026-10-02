import {
  createClientWithOAuth,
  getCheckComments,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  type CheckTargetOptions,
  checkTargetOptions,
  requireCheckTarget,
  resolveCheckTarget,
} from "./check-review-write.utils";
import { printCommentsTsv } from "./comments-tsv.utils";

interface Options extends CheckTargetOptions {
  apiToken?: string | null | undefined;
  includeResolved: boolean;
  json: boolean;
}

const handler = async ({
  apiToken,
  includeResolved,
  json,
  ...targetOptions
}: Options): Promise<void> => {
  initLogger();
  requireCheckTarget(targetOptions);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const target = await resolveCheckTarget(client, targetOptions);
  const comments = await getCheckComments({
    client,
    ...target,
    includeResolved,
  });

  if (json) {
    printJson(comments);
    return;
  }

  printCommentsTsv(comments, { includeResolved });
};

export const checkCommentsCommand: CommandModule<unknown, Options> = {
  command: "check-comments",
  describe:
    "Get the list of review comments for a given non-visual check of a test run: the reasons recorded with agent approve-check, reject-check and ignore-check decisions. Outputs a TSV table with columns id, author, isAgentAuthored, text plus the requested additional columns, in oldest-first order. Outputs only open comments by default. The text column is JSON-quoted (the only column that is) to keep multiline/tabbed comment bodies on one row.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    ...checkTargetOptions,
    includeResolved: {
      boolean: true,
      description:
        "Output resolved comments in addition to open comments; adds an isResolved column with the comment's resolved state.",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
