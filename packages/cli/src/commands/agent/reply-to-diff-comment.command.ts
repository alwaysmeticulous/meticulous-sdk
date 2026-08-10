import {
  createClientWithOAuth,
  replyToDiffComment,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  commentId: string;
  text: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  commentId,
  text,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const response = await replyToDiffComment({
    client,
    commentId,
    text,
  });
  if (json) {
    printJson(response);
  } else {
    console.log(response.commentId);
  }
};

export const replyToDiffCommentCommand: CommandModule<unknown, Options> = {
  command: "reply-to-diff-comment",
  describe:
    "Reply to a review comment thread. Outputs the created reply ID, or an object with commentId with --json.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    commentId: {
      string: true,
      description: "The root comment ID to reply to.",
      demandOption: true,
    },
    text: {
      string: true,
      description: "A succinct reply, ideally 1-3 sentences.",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
