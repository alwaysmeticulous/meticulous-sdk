import {
  createClientWithOAuth,
  rejectDiff,
  reviewDiffs,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  requireArgument,
  requireIdArgument,
} from "./argument-validation.utils";
import {
  DIFF_BATCH_NOTE,
  diffBatchOption,
  parseDiffBatch,
  printDiffBatch,
  requireSingleDiffOption,
} from "./diff-batch.utils";
import { diffDecisionCoordinateOptions } from "./diff-comment-write.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId?: string | undefined;
  screenshotName?: string | undefined;
  reason?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  diffs?: string | undefined;
  json: boolean;
}

const handler = async (options: Options): Promise<void> => {
  initLogger();
  const { apiToken, json } = options;
  const batch = parseDiffBatch(options);
  const diff = batch == null ? readSingleDiff(options) : null;
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  if (diff == null) {
    printDiffBatch(
      await reviewDiffs({ client, verdict: "reject", diffs: batch ?? [] }),
      json,
    );
    return;
  }
  const response = await rejectDiff({ client, ...diff });
  if (json) {
    printJson(response);
  } else {
    console.log(response.commentId);
  }
};

const readSingleDiff = (options: Options) => ({
  replayDiffId: requireIdArgument(
    "replayDiffId",
    requireSingleDiffOption("replayDiffId", options.replayDiffId),
  ),
  screenshotName: requireIdArgument(
    "screenshotName",
    requireSingleDiffOption("screenshotName", options.screenshotName),
  ),
  reason: requireArgument(
    "reason",
    requireSingleDiffOption("reason", options.reason),
  ),
  x: requireSingleDiffOption("x", options.x),
  y: requireSingleDiffOption("y", options.y),
});

export const rejectDiffCommand: CommandModule<unknown, Options> = {
  command: "reject-diff",
  describe: `Record an agent decision rejecting a screenshot diff and add a review comment explaining why. Outputs the ID of the review comment recording the decision, or an object with commentId with --json. ${DIFF_BATCH_NOTE}`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
    },
    screenshotName: {
      string: true,
      description:
        'The screenshot name, as listed by `agent test-run-diffs` (for example "after-event-5" or "end-state").',
    },
    reason: {
      string: true,
      description:
        "A succinct 1-3 sentence explanation of why the screenshot diff is a regression.",
    },
    ...diffDecisionCoordinateOptions,
    ...diffBatchOption("replayDiffId, screenshotName, reason, x and y"),
  },
  handler: wrapHandler(handler),
};
