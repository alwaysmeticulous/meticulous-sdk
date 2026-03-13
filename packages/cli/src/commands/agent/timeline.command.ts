import { createClient, getTimelineDiff } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
}

const STATUS_PREFIX: Record<string, string> = {
  identical: " ",
  removed: "-",
  added: "+",
  changed: "!",
};

const handler = async ({ apiToken, replayDiffId }: Options): Promise<void> => {
  initLogger();
  const client = createClient({ apiToken });

  const { baseReplayId, headReplayId, entries } = await getTimelineDiff(
    client,
    replayDiffId,
  );

  process.stderr.write(`base: ${baseReplayId}\n`);
  process.stderr.write(`head: ${headReplayId}\n`);

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

export const timelineCommand: CommandModule<unknown, Options> = {
  command: "timeline",
  describe: "Get timeline diff for a replay diff",
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
