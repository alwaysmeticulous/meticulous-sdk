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
  includeAllFiles: boolean;
  globFilter: string | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  includeAllFiles,
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
      includeAllFiles,
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
      `(${added} added, ${removed} removed, ${modified} modified); ` +
      `base ${result.base?.length ?? 0} file(s), head ${result.head?.length ?? 0} file(s)`,
  );
};

export const jsCoverageDiffCommand: CommandModule<unknown, Options> = {
  command: "js-coverage-diff",
  describe:
    "Get the JS coverage diff for a replay diff. Outputs TSV, one row per changed file: repoFilePath, status, baseRanges, headRanges (or JSON with --json).",
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
    includeAllFiles: {
      boolean: true,
      default: false,
      description:
        "Include base/head rows with no executed ranges (dropped by default).",
    },
    globFilter: {
      string: true,
      description:
        'Keep only repo file paths matching this gitignore-style glob, e.g. "src/components/**". Scopes base, head, and the diff.',
    },
  },
  handler: wrapHandler(handler),
};
