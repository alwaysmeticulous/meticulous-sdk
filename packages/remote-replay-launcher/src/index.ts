import {
  createClient,
  executeSecureTunnelTestRun,
  getApiToken,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  TestRun,
} from "@alwaysmeticulous/client";
import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { localtunnel } from "@alwaysmeticulous/tunnels-client";
import log from "loglevel";
import {
  ExecuteRemoteTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";
import { getPort } from "./url.utils";

export { TunnelData } from "./types";

const PROGRESS_UPDATE_INTERVAL_MS = 5_000; // 5 seconds
const MS_TO_WAIT_FOR_RETRY = 5 * 60 * 1_000; // 5 minutes

export const executeRemoteTestRun = async ({
  apiToken: apiToken_,
  appUrl,
  commitSha,
  secureTunnelHost,
  onTunnelCreated,
  onTestRunCreated,
  onProgressUpdate,
  keepTunnelOpenPromise,
  environment,
}: ExecuteRemoteTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  let url: URL;
  try {
    url = new URL(appUrl);
  } catch (error) {
    throw new Error(`Invalid app URL: ${appUrl}`);
  }

  const port = getPort(url);
  if (port === -1) {
    throw new Error(`Invalid app URL port: ${appUrl}`);
  }

  const tunnel = await localtunnel({
    logger,
    apiToken,
    localHost: url.hostname,
    ...(secureTunnelHost ? { host: secureTunnelHost } : {}),
    port,
    localHttps: false,
    allowInvalidCert: false,
  });

  logger.debug(`Creating test run`);

  if (!tunnel.url || !tunnel.basicAuthUser || !tunnel.basicAuthPassword) {
    throw new Error(
      "Either Tunnel URL, basic auth user or basic auth password were not set"
    );
  }

  onTunnelCreated?.({
    url: tunnel.url,
    basicAuthUser: tunnel.basicAuthUser,
    basicAuthPassword: tunnel.basicAuthPassword,
  });

  const testRun = await executeSecureTunnelTestRun({
    client,
    headSha: commitSha,
    tunnelUrl: tunnel.url,
    basicAuthUser: tunnel.basicAuthUser,
    basicAuthPassword: tunnel.basicAuthPassword,
    environment,
  });

  if (!testRun) {
    throw new Error("Test run was not created");
  }

  onTestRunCreated?.(testRun);

  const testRunCompleted = defer<TestRun>();

  let progressUpdateInterval: NodeJS.Timeout | undefined = undefined;
  let startedWaitingForRetryAt: number | undefined = undefined;

  const onTestRunCompleted = (completedTestRun: TestRun) => {
    if (
      completedTestRun.status === "ExecutionError" &&
      (startedWaitingForRetryAt === undefined ||
        Date.now() - startedWaitingForRetryAt < MS_TO_WAIT_FOR_RETRY)
    ) {
      // It may get re-triggered: let's wait to see if it does: we keep progressUpdateInterval
      // so it'll keep polling for updates. Eventually it'll either hit the timeout or the test run
      // will move to the Running state again and we'll wait a while more.
      if (startedWaitingForRetryAt === undefined) {
        startedWaitingForRetryAt = Date.now();
        logger.info(
          `Test run failed with execution error. Waiting for ${
            MS_TO_WAIT_FOR_RETRY / 1_000
          } seconds to see if it gets automatically retried...`
        );
      }
      return;
    }

    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
    }

    if (keepTunnelOpenPromise) {
      keepTunnelOpenPromise.then(() => {
        tunnel.close();

        testRunCompleted.resolve(completedTestRun);
      });
    } else {
      tunnel.close();

      testRunCompleted.resolve(completedTestRun);
    }
  };

  // Poll every few seconds for progress updates and exit when the test run is completed
  progressUpdateInterval = setInterval(async () => {
    const updatedTestRun = await getTestRun({ client, testRunId: testRun.id });
    onProgressUpdate?.(updatedTestRun);

    if (!IN_PROGRESS_TEST_RUN_STATUS.includes(updatedTestRun.status)) {
      onTestRunCompleted(updatedTestRun);

      return;
    } else if (startedWaitingForRetryAt !== undefined) {
      logger.info(
        `Retrying test run... (status is now ${updatedTestRun.status})`
      );
      startedWaitingForRetryAt = undefined;
    }
  }, PROGRESS_UPDATE_INTERVAL_MS);

  const completedTestRun = await testRunCompleted.promise;

  return {
    testRun: completedTestRun,
  };
};
