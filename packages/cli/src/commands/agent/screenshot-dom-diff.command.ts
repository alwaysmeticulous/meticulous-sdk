import {
  createClientWithOAuth,
  getScreenshotDomDiff,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  index: number | undefined;
  context: string | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  index,
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
    index,
    context,
  );

  // An out-of-range --index is a user error regardless of output format.
  if (result.diffs.length === 0 && result.totalDiffs > 0) {
    throw new CliUserError(
      `Index ${index} out of range (${result.totalDiffs} diff(s) available)`,
    );
  }

  if (json) {
    printJson(
      result.diffs.map((diff) => ({
        index: diff.index,
        content: diff.content,
      })),
    );
  } else if (result.diffs.length > 0) {
    if (index != null) {
      console.log(result.diffs[0].content);
    } else {
      for (const diff of result.diffs) {
        console.log(`[diff ${diff.index}]`);
        console.log(diff.content);
      }
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
    "Get the DOM diff for a replay diff screenshot. Outputs unified-diff-style text, one hunk per change (or JSON with --json).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayDiffId: {
      string: true,
      description: "The replay diff ID",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        'Screenshot name, exactly as listed in the screenshotName column of `agent test-run-diffs` for this replay diff (e.g. "after-event-5", "end-state", or "auxiliary-291-0-exit_animation")',
      demandOption: true,
    },
    index: {
      number: true,
      description:
        "Show only the diff hunk at this 0-based index (omit to show all hunks with indices)",
    },
    context: {
      string: true,
      description:
        'Context lines around each hunk: a number (default 3), 0 for none, or "full" for single unified diff with full file context (requires --index to be omitted)',
    },
  },
  handler: wrapHandler(handler),
};
