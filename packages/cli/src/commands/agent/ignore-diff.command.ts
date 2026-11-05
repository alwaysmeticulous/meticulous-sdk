import {
  createClientWithOAuth,
  IGNORE_DIFF_CRITERIA,
  ignoreDiff,
  REPORT_FLAKE_DESCRIPTION,
  reviewDiffs,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
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
  reportFlake: boolean;
  diffs?: string | undefined;
  json: boolean;
}

const handler = async (options: Options): Promise<void> => {
  initLogger();
  const { apiToken, reportFlake, json } = options;
  const batch = parseDiffBatch(options);
  // Checked here rather than with yargs `conflicts`, which would count
  // --reportFlake's default of false as given.
  if (batch != null && reportFlake) {
    throw new CliUserError(
      "--diffs cannot be combined with --reportFlake: set reportFlake on each diff inside --diffs instead.",
    );
  }
  const diff = batch == null ? readSingleDiff(options) : null;
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  if (diff == null) {
    printDiffBatch(
      await reviewDiffs({ client, verdict: "ignore", diffs: batch ?? [] }),
      json,
    );
    return;
  }
  const response = await ignoreDiff({ client, ...diff, reportFlake });
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

export const ignoreDiffCommand: CommandModule<unknown, Options> = {
  command: "ignore-diff",
  describe: `Record an agent decision ignoring a screenshot diff as unrelated to the change under review, and add a review comment explaining why. On a project without the "Let agents approve and ignore diffs" setting this does not actually ignore the diff: it only adds the comment, so the diff stays unreviewed and the pull request check stays pending until a human decides. ${IGNORE_DIFF_CRITERIA} Refused on a diff a person rejected. Outputs the ID of the review comment, or an object with commentId with --json. ${DIFF_BATCH_NOTE}`,
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
        "A succinct 1-3 sentence explanation of why the screenshot diff is unrelated to the change under review.",
    },
    ...diffDecisionCoordinateOptions,
    reportFlake: {
      boolean: true,
      default: false,
      description: REPORT_FLAKE_DESCRIPTION,
    },
    ...diffBatchOption(
      "replayDiffId, screenshotName, reason, x and y, and optionally reportFlake",
    ),
  },
  handler: wrapHandler(handler),
};
