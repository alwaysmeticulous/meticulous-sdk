import { approveDiff, createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  requireArgument,
  requireIdArgument,
} from "./argument-validation.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  reason?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
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
  requireIdArgument("replayDiffId", replayDiffId);
  requireIdArgument("screenshotName", screenshotName);
  if (reason != null) {
    requireArgument("reason", reason);
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const response = await approveDiff({
    client,
    replayDiffId,
    screenshotName,
    reason,
    x,
    y,
  });
  if (json) {
    printJson(response);
  } else if (response.commentId != null) {
    console.log(response.commentId);
  } else {
    logNotice("Diff approved; no --reason was given, so no comment was added.");
  }
};

export const approveDiffCommand: CommandModule<unknown, Options> = {
  command: "approve-diff",
  describe:
    "Record an agent decision approving a screenshot diff, optionally with a review comment explaining why. Refused on a diff a person rejected. Outputs the ID of the review comment recording the decision, or an object with commentId with --json; with no --reason there is no comment, so it outputs nothing, or an empty object with --json.",
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
        "An optional succinct 1-3 sentence explanation of why the screenshot diff is an intended result of the change under review, posted as a review comment. Requires --x and --y.",
      implies: ["x", "y"],
    },
    x: {
      number: true,
      description:
        "Approximate normalized horizontal image coordinate from 0 to 1 for the reason's comment. Required with --reason, and only then.",
      implies: "reason",
    },
    y: {
      number: true,
      description:
        "Approximate normalized vertical image coordinate from 0 to 1 for the reason's comment. Required with --reason, and only then.",
      implies: "reason",
    },
  },
  handler: wrapHandler(handler),
};
