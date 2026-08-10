import { createClientWithOAuth, rejectDiff } from "@alwaysmeticulous/client";
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
  await rejectDiff({
    client,
    replayDiffId,
    screenshotName,
    reason,
    x,
    y,
  });
  if (json) {
    printJson({});
  }
};

export const rejectDiffCommand: CommandModule<unknown, Options> = {
  command: "reject-diff",
  describe:
    "Record an agent decision rejecting a screenshot diff and add a review comment explaining why. The rejection goes into the same review ledger a human rejection goes into and blocks the pull request the same way, replacing any earlier decision on the diff. The test run must belong to a pull request. Outputs nothing on success, or an empty object with --json.",
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
        "A succinct 1-3 sentence explanation of why the screenshot diff is a regression.",
      demandOption: true,
    },
    ...diffCommentCoordinateOptions,
  },
  handler: wrapHandler(handler),
};
