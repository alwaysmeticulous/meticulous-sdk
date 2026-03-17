import { createClient, getScreenshotDomDiff } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  index: number | undefined;
  context: string | undefined;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  index,
  context,
}: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });

  const result = await getScreenshotDomDiff(
    client,
    replayDiffId,
    screenshotName,
    index,
    context,
  );

  if (result.diffs.length === 0) {
    if (result.totalDiffs === 0) {
      console.log("No differences found");
    } else {
      console.error(
        `Index ${index} out of range (${result.totalDiffs} diff(s) available)`,
      );
      process.exit(1);
    }
    return;
  }

  if (index != null) {
    console.log(result.diffs[0].content);
  } else {
    for (const diff of result.diffs) {
      console.log(`[diff ${diff.index}]`);
      console.log(diff.content);
    }
  }
};

export const domDiffCommand: CommandModule<unknown, Options> = {
  command: "dom-diff",
  describe: "Get screenshot DOM diff for a replay diff screenshot",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayDiffId: {
      string: true,
      description: "The replay diff ID",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description: 'Screenshot name (e.g. "after-event-5" or "end-state")',
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
