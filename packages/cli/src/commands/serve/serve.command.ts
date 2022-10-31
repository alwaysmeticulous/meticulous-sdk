import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { buildCommand } from "../../command-utils/command-builder";
import { serveAssetsFromSimulation } from "../../local-data/serve-assets-from-simulation";

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
  logger.info(`Serving assets at url ${url}`);
};

export const serve = buildCommand("serve")
  .details({
    describe:
      "Spin up a localhost server to serve the assets that were snapshotted when running a particular replay",
  })
  .options({
    apiToken: {
      string: true,
    },
    replayId: {
      string: true,
      demandOption: true,
    },
  })
  .handler(handler);
