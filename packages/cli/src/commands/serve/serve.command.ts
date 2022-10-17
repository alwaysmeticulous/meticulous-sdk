import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { serveAssetsFromSimulation } from "../../local-data/serve-assets-from-simulation";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  replayId,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });
  const { url } = await serveAssetsFromSimulation(client, replayId);
  logger.log(`Serving assets at url ${url}`);
};

export const serve: CommandModule<unknown, Options> = {
  command: "serve",
  describe:
    "Spin up a localhost server to serve the assets that were snapshotted when running a particular replay",
  builder: {
    apiToken: {
      string: true,
    },
    replayId: {
      string: true,
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
