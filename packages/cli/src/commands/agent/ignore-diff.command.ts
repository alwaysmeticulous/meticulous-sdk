import {
  createClientWithOAuth,
  IGNORE_DIFF_CRITERIA,
  ignoreDiff,
  REPORT_FLAKE_DESCRIPTION,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  requireArgument,
  requireIdArgument,
} from "./argument-validation.utils";
import { diffCommentCoordinateOptions } from "./diff-comment-write.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  reason: string;
  x: number;
  y: number;
  reportFlake: boolean;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  reason,
  x,
  y,
  reportFlake,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayDiffId", replayDiffId);
  requireIdArgument("screenshotName", screenshotName);
  requireArgument("reason", reason);
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
    reportFlake,
  });
  if (json) {
    printJson(response);
  } else {
    console.log(response.commentId);
  }
};

export const ignoreDiffCommand: CommandModule<unknown, Options> = {
  command: "ignore-diff",
  describe: `Record an agent decision ignoring a screenshot diff as unrelated to the change under review, and add a review comment explaining why. On a project without the "Enable approve/ignore diff actions" setting this does not actually ignore the diff: it only adds the comment, so the diff stays unreviewed and the pull request check stays pending until a human decides. ${IGNORE_DIFF_CRITERIA} Refused on a diff a person rejected. Outputs the ID of the review comment, or an object with commentId with --json.`,
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
        "A succinct 1-3 sentence explanation of why the screenshot diff is unrelated to the change under review.",
      demandOption: true,
    },
    ...diffCommentCoordinateOptions,
    reportFlake: {
      boolean: true,
      default: false,
      description: REPORT_FLAKE_DESCRIPTION,
    },
  },
  handler: wrapHandler(handler),
};
