import {
  createClientWithOAuth,
  createDiffComment,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { diffCommentCoordinateOptions } from "./diff-comment-write.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  text: string;
  x: number;
  y: number;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  text,
  x,
  y,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const response = await createDiffComment({
    client,
    replayDiffId,
    screenshotName,
    text,
    x,
    y,
  });
  if (json) {
    printJson(response);
  } else {
    console.log(response.commentId);
  }
};

export const createDiffCommentCommand: CommandModule<unknown, Options> = {
  command: "create-diff-comment",
  describe:
    "Start a review comment thread on a screenshot diff. Outputs the created comment ID, or an object with commentId with --json.",
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
    text: {
      string: true,
      description: "A succinct review comment, ideally 1-3 sentences.",
      demandOption: true,
    },
    ...diffCommentCoordinateOptions,
  },
  handler: wrapHandler(handler),
};
