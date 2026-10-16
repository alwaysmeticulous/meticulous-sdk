import { createClientWithOAuth } from "@alwaysmeticulous/client";
import {
  ensureReplayLogTextFiles,
  getOrFetchReplay,
  getOrFetchReplayArchive,
} from "@alwaysmeticulous/downloading-helpers";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "../agent/argument-validation.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayId,
  json,
}: Options): Promise<void> => {
  requireIdArgument("replayId", replayId);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  await getOrFetchReplay(client, replayId);
  const { fileName: path } = await getOrFetchReplayArchive(
    client,
    replayId,
    "everything",
  );
  await ensureReplayLogTextFiles(path);

  if (json) {
    printJson({ replayId, path });
  } else {
    console.log(path);
  }
};

export const downloadReplayCommand: CommandModule<unknown, Options> = {
  command: "replay",
  describe:
    "Download the data for a given replay (screenshots, timeline, logs, coverage and other artifacts). Outputs the local directory it was written to.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayId: {
      string: true,
      demandOption: true,
      description: "The replay ID.",
    },
  },
  handler: wrapHandler(handler),
};
