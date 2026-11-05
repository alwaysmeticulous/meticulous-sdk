import { join } from "path";
import {
  createClientWithOAuth,
  getProject,
  getRecordingCommandId,
  postSessionIdNotification,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import {
  DebugLogger,
  getCommitSha,
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import { recordSession } from "@alwaysmeticulous/record";
import type { CommandModule } from "yargs";
import {
  COMMON_RECORD_OPTIONS,
  OPTIONS,
} from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  RECORDING_SNIPPET_PATH,
  WORKER_RECORDING_SNIPPET_PATH,
} from "../../utils/constants";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { loadRecordStorageState } from "./load-record-storage-state";

interface Options {
  apiToken: string | null | undefined;
  commitSha: string | null | undefined;
  devTools: boolean | null | undefined;
  bypassCSP: boolean | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  uploadIntervalMs: number | null | undefined;
  incognito: boolean | null | undefined;
  trace: boolean | null | undefined;
  captureHttpOnlyCookies: boolean;
  appUrl: string | null | undefined;
  maxPayloadSize: number | null | undefined;
  remoteDebuggingPort: number | null | undefined;
  headless: boolean;
  storageState: string | null | undefined;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  devTools,
  bypassCSP,
  width,
  height,
  uploadIntervalMs,
  incognito,
  trace,
  captureHttpOnlyCookies,
  appUrl,
  maxPayloadSize,
  remoteDebuggingPort,
  headless,
  storageState,
}: Options): Promise<void> => {
  const logger = initLogger();
  const debugLogger = trace ? await DebugLogger.create() : null;

  if (headless && remoteDebuggingPort == null) {
    logger.error(
      "--headless requires --remoteDebuggingPort: nothing could drive or close a headless browser otherwise.",
    );
    process.exit(1);
  }

  if (storageState && !appUrl) {
    throw new CliUserError(
      "--storageState requires --appUrl: its local storage is seeded for that URL's origin.",
    );
  }
  const storageToSeed =
    storageState && appUrl
      ? await loadRecordStorageState(storageState, appUrl)
      : null;

  logger.info("Preparing recording...");

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const { projectId } = await resolveProjectIdentifier(apiToken_);
  // Use the OAuth-aware client so the short-lived access token is refreshed per
  // request via the stored refresh token — recording sessions outlive the ~5min
  // access-token lifetime, and a baked-in token starts returning 403s otherwise.
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const project = await getProject(client, projectId);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const recordingToken = project.recordingToken;
  if (!recordingToken) {
    logger.error("Could not retrieve recording token.");
    process.exit(1);
  }

  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  const recordingSnippet = await fetchAsset(RECORDING_SNIPPET_PATH);
  const workerRecordingSnippet = await fetchAsset(
    WORKER_RECORDING_SNIPPET_PATH,
  );
  const cookieDir = join(getMeticulousLocalDataDir(), "cookies");
  const recordingCommandId = await getRecordingCommandId(client, projectId);

  const onDetectedSession = (sessionId: string) => {
    const organizationName = encodeURIComponent(project.organization.name);
    const projectName = encodeURIComponent(project.name);
    const sessionUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/sessions/${sessionId}`;
    logger.info(`Recording session: ${sessionUrl}`);

    postSessionIdNotification(
      client,
      sessionId,
      recordingCommandId,
      projectId,
    ).catch((error) => {
      logger.error(
        `Warning: error while notifying session recording ${sessionId}`,
      );
      logger.error(error);
      debugLogger?.log(
        `Warning: error while notifying session recording ${sessionId}`,
      );
      debugLogger?.log(`${error}`);
    });
  };

  await recordSession({
    recordingToken,
    appCommitHash: commitSha,
    devTools,
    bypassCSP,
    recordingSnippet,
    workerRecordingSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    debugLogger,
    onDetectedSession,
    captureHttpOnlyCookies,
    appUrl,
    maxPayloadSize,
    remoteDebuggingPort,
    headless,
    storageToSeed,
  }).catch((error) => {
    debugLogger?.log(`${error}`);
    throw error;
  });
};

export const recordSessionCommand: CommandModule<unknown, Options> = {
  command: "session",
  describe: "Record a session",
  builder: {
    ...COMMON_RECORD_OPTIONS,
    commitSha: OPTIONS.commitSha,
    incognito: {
      boolean: true,
      description: "Use an incognito browsing context",
      default: true,
    },
    remoteDebuggingPort: {
      number: true,
      description:
        "Expose Chrome DevTools Protocol on this port so external agents (e.g. agent-browser connect <port>) can drive the recording browser",
    },
    headless: {
      boolean: true,
      description:
        "Run the recording browser headless. Requires --remoteDebuggingPort, since only an external agent can then drive the browser, and the recording ends when that agent closes the page",
      default: false,
    },
    storageState: {
      string: true,
      description:
        "Path to a JSON file of cookies and local storage to load into the browser before the app first loads, " +
        "so the recording starts signed in. Accepts a Playwright storage state ({ cookies, origins }) or an array " +
        "of Puppeteer / Chrome DevTools cookies. Only the local storage of --appUrl's origin is loaded. " +
        "Requires --appUrl, and replaces the cookies otherwise reused across --no-incognito recordings.",
    },
  },
  handler: wrapHandler(handler),
};
