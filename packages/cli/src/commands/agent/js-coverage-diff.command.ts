import {
  createClientWithOAuth,
  getReplayDiffJsCoverage,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string | undefined;
  json: boolean;
}

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const result = await getReplayDiffJsCoverage(
    client,
    replayDiffId,
    screenshotName,
  );

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const header = ["repoFilePath", "status", "baseRanges", "headRanges"];
  console.log(header.join("\t"));

  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const d of result.diff) {
    if (d.status === "added") {
      added++;
    } else if (d.status === "removed") {
      removed++;
    } else if (d.status === "modified") {
      modified++;
    }
    const fields = [
      d.filePath,
      d.status,
      formatCoverageRanges(d.baseRanges),
      formatCoverageRanges(d.headRanges),
    ];
    console.log(fields.join("\t"));
  }

  log(
    `${result.diff.length} file(s) with coverage changes ` +
      `(${added} added, ${removed} removed, ${modified} modified); ` +
      `base ${result.base?.length ?? 0} file(s), head ${result.head?.length ?? 0} file(s)`,
  );
};

export const jsCoverageDiffCommand: CommandModule<unknown, Options> = {
  command: "js-coverage-diff",
  describe:
    "Get the JS coverage diff (base vs head) for a replay diff, for a single screenshot or the whole replay",
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
        'Screenshot name (e.g. "after-event-5" or "end-state"). Omit for the whole-replay diff.',
    },
    json: {
      boolean: true,
      description: "Output the raw coverage response as JSON",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
