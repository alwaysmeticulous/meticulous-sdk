import { createClientWithOAuth, ignoreDiff } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { diffCommentCoordinateOptions } from "./diff-comment-write.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  reason: string;
  x: number;
  y: number;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  reason,
  x,
  y,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const response = await ignoreDiff({
    client,
    replayDiffId,
    screenshotName,
    reason,
    x,
    y,
  });
  if (json) {
    printJson(response);
  } else {
    console.log(response.commentId);
  }
};

export const ignoreDiffCommand: CommandModule<unknown, Options> = {
  command: "ignore-diff",
  describe:
    "Record an agent's view that a screenshot diff is expected variation, as a review comment explaining why. This decides nothing: the diff stays unreviewed, keeps appearing under --onlyUnreviewed, and the pull request check stays pending until a human decides. Only a human can accept or ignore a diff. Outputs the created comment ID, or an object with commentId with --json.",
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
        'The screenshot name, as listed by `agent test-run-diffs` (for example "after-event-5" or "end-state").',
      demandOption: true,
    },
    reason: {
      string: true,
      description:
        "A succinct 1-3 sentence explanation of why the screenshot diff should be ignored.",
      demandOption: true,
    },
    ...diffCommentCoordinateOptions,
  },
  handler: wrapHandler(handler),
};
