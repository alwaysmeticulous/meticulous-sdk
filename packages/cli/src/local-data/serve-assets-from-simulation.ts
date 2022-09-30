import { AxiosInstance } from "axios";
import { getOrFetchReplayArchive, getSnapshottedAssetsDir } from "./replays";
import express from "express";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { existsSync } from "fs";
import log from "loglevel";
import findFreePort from "find-free-port";

const STARTING_PORT = 9100;

export async function serveAssetsFromSimulation(
  client: AxiosInstance,
  simulationId: string
): Promise<{ url: string; closeServer: () => void }> {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  await getOrFetchReplayArchive(client, simulationId);
  const snapshottedAssetsDir = getSnapshottedAssetsDir(simulationId);

  if (!existsSync(snapshottedAssetsDir)) {
    logger.error(
      `No snapshotted assets found for simulation '${simulationId}'. Please re-run without the --simulationIdForAssets flag.` +
        ` You can optionally specify an --appUrl to run the simulation against.`
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.static(snapshottedAssetsDir));

  const serverStartupPromise = defer();

  const [port] = await findFreePort(STARTING_PORT);
  const server = app.listen(port, () => serverStartupPromise.resolve());

  return serverStartupPromise.promise.then(() => ({
    url: `http://localhost:${port}`,
    closeServer: server.close.bind(server),
  }));
}
