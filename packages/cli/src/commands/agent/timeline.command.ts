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

const STATUS_PREFIX: Record<string, string> = {
  identical: " ",
  removed: "-",
  added: "+",
  changed: "!",
};

// The JSON `diff` field mirrors STATUS_PREFIX but uses "=" for identical, where
// the TSV keeps a space.
const STATUS_SYMBOL: Record<string, string> = {
  ...STATUS_PREFIX,
  identical: "=",
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
        diff: STATUS_SYMBOL[entry.status] ?? entry.status,
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
    "Get the timeline diff for a replay diff. Outputs TSV, one row per timeline entry: diff, timeMs, event, description (or JSON with --json).",
  builder: {
    apiToken: { string: true, description: "Meticulous API token" },
    replayDiffId: {
      string: true,
      description: "The replay diff ID",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
