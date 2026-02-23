import { CompanionAssetsInfo } from "@alwaysmeticulous/api";
import {
  createClient,
  executeSecureTunnelTestRun,
  getApiToken,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  TestRun,
  getIsLocked,
} from "@alwaysmeticulous/client";
import { defer, initLogger } from "@alwaysmeticulous/common";
import { localtunnel } from "@alwaysmeticulous/tunnels-client";
import { uploadAssets, uploadAssetsFromZip } from "./asset-upload-utils";
import { ResourceTracker } from "./resource-tracker";
import {
  ExecuteRemoteTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";
import { UPLOAD_ARCHIVE_TYPE as UPLOADED_ARCHIVE_TYPE } from "./upload-utils/multipart-zip-uploader";
import { getPort } from "./url.utils";

export { TunnelData } from "./types";

const POLL_LOCK_INTERVAL_MS = 5_000; // 5 seconds
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
  onTunnelStillLocked,
  keepTunnelOpenPromise,
  environment,
  isLockable,
  pullRequestHostingProviderId,
  companionAssets,
  allowInvalidCert = false,
  proxyAllUrls = false,
  rewriteHostnameToAppUrl = false,
  enableDnsCache = false,
  http2Connections,
  silenceTunnelWorker = false,
  postComment = false,
}: ExecuteRemoteTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  let url: URL;
  try {
    url = new URL(appUrl);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    throw new Error(`Invalid app URL: ${appUrl}`);
  }

  const port = getPort(url);
  if (port === -1) {
    throw new Error(`Invalid app URL port: ${appUrl}`);
  }

  let companionAssetsInfo: CompanionAssetsInfo | undefined = undefined;
  if (companionAssets) {
    const { folder, zip, regex } = companionAssets;
    logger.info(`Uploading companion assets from ${folder ?? zip}`);
    const opts = {
      apiToken,
      commitSha,
      waitForBase: false,
      rewrites: [],
      createDeployment: false,
      warnIfNoIndexHtml: false,
    };
    const result = folder
      ? await uploadAssets({
          ...opts,
          appDirectory: folder,
          warnIfNoIndexHtml: false,
        })
      : zip
        ? await uploadAssetsFromZip({ ...opts, zipPath: zip })
        : undefined;
    if (!result) {
      throw new Error("Expected either folder or zip to be provided!");
    }
    const { uploadId } = result;
    companionAssetsInfo = {
      deploymentUploadId: uploadId,
      regex,
      archiveType: UPLOADED_ARCHIVE_TYPE,
    };
    logger.info(`Companion assets uploaded with ID: ${uploadId}`);
  }

  const tunnel = await localtunnel({
    logger,
    apiToken,
    localHost: url.hostname,
    ...(secureTunnelHost ? { host: secureTunnelHost } : {}),
    port,
    localHttps: url.protocol === "https:",
    allowInvalidCert,
    proxyAllUrls,
    rewriteHostnameToAppUrl,
    enableDnsCache,
    http2Connections,
    silenceTunnelWorker,
  });

  logger.debug(`Creating test run`);

  if (!tunnel.url || !tunnel.basicAuthUser || !tunnel.basicAuthPassword) {
    throw new Error(
      "Either Tunnel URL, basic auth user or basic auth password were not set",
    );
  }

  onTunnelCreated?.({
    url: tunnel.url,
    basicAuthUser: tunnel.basicAuthUser,
    basicAuthPassword: tunnel.basicAuthPassword,
  });

  const response = await executeSecureTunnelTestRun({
    client,
    headSha: commitSha,
    tunnelUrl: tunnel.url,
    basicAuthUser: tunnel.basicAuthUser,
    basicAuthPassword: tunnel.basicAuthPassword,
    environment,
    isLockable,
    postComment,
    ...(companionAssetsInfo ? { companionAssetsInfo } : {}),
    ...(pullRequestHostingProviderId ? { pullRequestHostingProviderId } : {}),
  });
  if (!response.testRun) {
    throw new Error(`${response.message ?? "Test run was not created"}`);
  }

  const { testRun, deploymentId } = response;
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
          } seconds to see if it gets automatically retried...`,
        );
      }
      return;
    }

    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
    }

    testRunCompleted.resolve(completedTestRun);
  };

  // Poll every few seconds for progress updates and exit when the test run is completed
  const resourceTracker = new ResourceTracker(logger, testRun);
  progressUpdateInterval = setInterval(async () => {
    const updatedTestRun = await getTestRun({ client, testRunId: testRun.id });
    onProgressUpdate?.(updatedTestRun);

    if (!IN_PROGRESS_TEST_RUN_STATUS.includes(updatedTestRun.status)) {
      onTestRunCompleted(updatedTestRun);

      return;
    } else if (startedWaitingForRetryAt !== undefined) {
      logger.info(
        `Retrying test run... (status is now ${updatedTestRun.status})`,
      );
      startedWaitingForRetryAt = undefined;
    }
    await resourceTracker.checkUsage();
  }, PROGRESS_UPDATE_INTERVAL_MS);

  const completedTestRun = await testRunCompleted.promise;

  const tunnelUnlocked = defer<void>();
  let tunnelCheckInterval: NodeJS.Timeout | undefined = undefined;
  const checkUnlocked = async () => {
    const isLocked = await getIsLocked({ client, deploymentId });
    if (isLocked) {
      onTunnelStillLocked?.();
      await resourceTracker.checkUsage();
      return false;
    }
    tunnelUnlocked.resolve();
    return true;
  };
  const alreadyUnlocked = await checkUnlocked();
  if (!alreadyUnlocked) {
    tunnelCheckInterval = setInterval(checkUnlocked, POLL_LOCK_INTERVAL_MS);
    await tunnelUnlocked.promise;
  }
  if (tunnelCheckInterval) {
    clearInterval(tunnelCheckInterval);
  }

  if (keepTunnelOpenPromise) {
    await keepTunnelOpenPromise;
  }
  tunnel.close();

  return {
    testRun: completedTestRun,
  };
};
