import {
  createClientWithOAuth,
  getTimelineDiff,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  json: boolean;
}

// TSV-only compact marker per status. The JSON output (and the MCP tool) carry
// the raw status enum in the `diff` attribute instead of this symbol.
const STATUS_PREFIX: Record<string, string> = {
  identical: " ",
  removed: "-",
  added: "+",
  changed: "!",
};

const handler = async ({
  apiToken,
  replayDiffId,
  json,
}: Options): Promise<void> => {
  initLogger();
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const { entries } = await getTimelineDiff(client, replayDiffId);

  if (json) {
    printJson(
      entries.map((entry) => ({
        diff: entry.status,
        timeMs: entry.timeMs,
        event: entry.eventKind,
        description: entry.description,
      })),
    );
    return;
  }

  console.log(["diff", "timeMs", "event", "description"].join("\t"));

  for (const entry of entries) {
    console.log(
      [
        STATUS_PREFIX[entry.status] ?? " ",
        entry.timeMs,
        entry.eventKind,
        entry.description,
      ].join("\t"),
    );
  }
};

export const timelineDiffCommand: CommandModule<unknown, Options> = {
  command: "timeline-diff",
  describe:
    "Get the list of timeline event diffs for a given replay diff. Outputs a TSV table with columns diff, timeMs, event, description.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
