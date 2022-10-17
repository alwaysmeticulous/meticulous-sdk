import { AxiosInstance } from "axios";
import { getOrFetchReplayArchive, getSnapshottedAssetsDir } from "./replays";
import express from "express";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { existsSync } from "fs";
import log from "loglevel";
import findFreePort from "find-free-port";
import { Server } from "http";

// We must avoid ports blocked by Chrome: https://superuser.com/questions/188058/which-ports-are-considered-unsafe-by-chrome
const STARTING_PORT = 9100;
const ENDING_PORT = 10079;
const MAX_RETRY_ATTEMPTS = 3;

export async function serveAssetsFromSimulation(
  client: AxiosInstance,
  simulationId: string
): Promise<{ url: string; closeServer: () => void }> {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  await getOrFetchReplayArchive(client, simulationId);
  const snapshottedAssetsDir = getSnapshottedAssetsDir(simulationId);

  if (!existsSync(snapshottedAssetsDir)) {
    logger.error(
      `No snapshotted assets found for simulation '${simulationId}'.` +
        " Please re-run without the --simulationIdForAssets or --useAssetsSnapshottedInBaseSimulation flag." +
        " You can optionally specify an --appUrl to run the simulation against."
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.static(snapshottedAssetsDir));

  const serverStartupPromise = defer();

  const { server, port } = await retryUntilFreePortFound((portToTry) =>
    app.listen(portToTry, () => serverStartupPromise.resolve())
  );

  return serverStartupPromise.promise.then(() => ({
    url: `http://localhost:${port}`,
    closeServer: server.close.bind(server),
  }));
}

// We retry a few times in case of race conditions (two servers trying to grab same port at same time)
const retryUntilFreePortFound = async (
  startServer: (port: number) => Server,
  attempt = 0
): Promise<{ server: Server; port: number }> => {
  // We randomize the port to try to minimize chance of race conditions
  const [port] = await findFreePort(
    randomNumberBetween(STARTING_PORT, ENDING_PORT)
  );

  try {
    return { server: startServer(port), port };
  } catch (err: unknown) {
    if (attempt < MAX_RETRY_ATTEMPTS) {
      return retryUntilFreePortFound(startServer, attempt + 1);
    }
    throw err;
  }
};

const randomNumberBetween = (inclusiveStart: number, exclusiveEnd: number) =>
  Math.floor(Math.random() * (exclusiveEnd - inclusiveStart) + inclusiveStart);
