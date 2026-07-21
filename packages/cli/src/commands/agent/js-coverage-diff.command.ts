import {
  createClientWithOAuth,
  getReplayDiffJsCoverage,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string | undefined;
  globFilter: string | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  globFilter,
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
    {
      globFilter,
    },
  );

  const added = result.diff.filter((d) => d.status === "added").length;
  const removed = result.diff.filter((d) => d.status === "removed").length;
  const modified = result.diff.filter((d) => d.status === "modified").length;

  if (json) {
    printJson(
      result.diff.map((d) => ({
        repoFilePath: d.filePath,
        status: d.status,
        baseRanges: d.baseRanges,
        headRanges: d.headRanges,
      })),
    );
  } else {
    const header = ["repoFilePath", "status", "baseRanges", "headRanges"];
    console.log(header.join("\t"));
    for (const d of result.diff) {
      const fields = [
        d.filePath,
        d.status,
        formatCoverageRanges(d.baseRanges),
        formatCoverageRanges(d.headRanges),
      ];
      console.log(fields.join("\t"));
    }
  }

  // Summary on stderr regardless of --json (which only changes stdout).
  logNotice(
    `${result.diff.length} file(s) with coverage changes ` +
      `(${added} added, ${removed} removed, ${modified} modified)`,
  );
};

export const jsCoverageDiffCommand: CommandModule<unknown, Options> = {
  command: "js-coverage-diff",
  describe:
    "Get the list of per-file JavaScript coverage diffs for a given replay diff (or a single screenshot of it). Outputs a TSV table with columns repoFilePath, status, baseRanges, headRanges.",
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
        "Restrict coverage to this screenshot, which is only the coverage recorded since the preceding screenshot (omit for the whole-replay diff).",
    },
    globFilter: {
      string: true,
      description:
        "Output only files whose repo path matches this gitignore-style glob (e.g. src/components/**).",
    },
  },
  handler: wrapHandler(handler),
};
