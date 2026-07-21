import {
  createClientWithOAuth,
  getScreenshotDomDiff,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  context: string | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  context,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const result = await getScreenshotDomDiff(
    client,
    replayDiffId,
    screenshotName,
    context,
  );

  if (json) {
    printJson(
      result.diffs.map((diff) => ({
        index: diff.index,
        content: diff.content,
      })),
    );
  } else if (result.diffs.length > 0) {
    for (const diff of result.diffs) {
      console.log(`[diff ${diff.index}]`);
      console.log(diff.content);
    }
  }

  // Guidance on stderr regardless of --json (which only changes stdout).
  if (result.diffs.length === 0) {
    logNotice("No differences found");
  }
};

export const domDiffCommand: CommandModule<unknown, Options> = {
  command: "dom-diff",
  describe:
    "Get the DOM diff for a given screenshot diff. Outputs unified-diff-style text, one hunk per change.",
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
    context: {
      string: true,
      description:
        'Context lines around each hunk: a non-negative integer (default 3, 0 for none), or "full" for a single unified diff of the entire DOM.',
    },
  },
  handler: wrapHandler(handler),
};
