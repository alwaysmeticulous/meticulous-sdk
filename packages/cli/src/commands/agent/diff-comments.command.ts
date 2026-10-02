import {
  createClientWithOAuth,
  getDiffComments,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "./argument-validation.utils";
import { printCommentThreadsTsv } from "./comments-tsv.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  includeResolved: boolean;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  includeResolved,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayDiffId", replayDiffId);
  requireIdArgument("screenshotName", screenshotName);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const comments = await getDiffComments(client, replayDiffId, screenshotName, {
    includeResolved,
  });

  if (json) {
    printJson(comments);
    return;
  }

  printCommentThreadsTsv(comments, {
    includeResolved,
    threadColumns: [
      { name: "x", value: ({ x }) => x.toFixed(5) },
      { name: "y", value: ({ y }) => y.toFixed(5) },
    ],
  });
};

export const diffCommentsCommand: CommandModule<unknown, Options> = {
  command: "diff-comments",
  describe:
    "Get the list of review comments for a given screenshot diff. Outputs a TSV table with columns id, replyToCommentId, author, isAgentAuthored, text, x, y plus the requested additional columns, with each comment followed by its replies; comments and replies are in oldest-first order. replyToCommentId is TSV-only (blank for top-level comments, no JSON/MCP equivalent) so a reply row can be linked back to its parent; a reply's x/y repeat the parent's, since replies don't carry their own coordinates. Outputs only open comments by default. The text column is JSON-quoted (the only column that is) to keep multiline/tabbed comment bodies on one row.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        'The screenshot name, as listed in the screenshotName column of `agent test-run-diffs` (e.g. "after-event-5" or "end-state").',
      demandOption: true,
    },
    includeResolved: {
      boolean: true,
      description:
        "Output resolved comments in addition to open comments; adds an isResolved column with the comment's resolved state.",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
