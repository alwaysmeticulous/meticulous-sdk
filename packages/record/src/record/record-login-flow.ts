import { defer, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import chalk from "chalk";
import log, { Logger } from "loglevel";
import { Browser, launch, Page } from "puppeteer";
import { RecordLoginFlowOptions } from "../types";
import {
  COMMON_RECORD_CHROME_LAUNCH_ARGS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DEFAULT_UPLOAD_INTERVAL_MS,
  INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
  METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
} from "./constants";
import { bootstrapPage } from "./record.utils";
import { exposeNewRecordingCallback } from "./utils/expose-new-recording-callback";
import { injectFinishRecordingFrame } from "./utils/inject-finish-recording-frame";
import {
  printNoLoginSessionRecordedWarning,
  printPageClosedWarning,
} from "./utils/print-warning";

type ModifiedWindow = {
  __meticulous?: {
    flushPendingPayloads?: () => Promise<void>;
  };
};

export const LOGIN_FLOW_SESSION_RECORDING_SOURCE = "cli-login-flow";
export const LOGIN_FLOW_DATA_SESSION_RECORDING_SOURCE =
  "cli-login-flow-application-storage";

const bootstrapLoginFlowRecordingPage = async ({
  page,
  recordingToken,
  recordingSnippetUrl,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  recordingSource,
  bypassCSP,
}: Omit<
  Parameters<typeof bootstrapPage>[0],
  "uploadIntervalMs" | "captureHttpOnlyCookies" | "appCommitHash"
> & {
  uploadIntervalMs: number | null | undefined;
  captureHttpOnlyCookies: boolean | undefined;
  bypassCSP: boolean | null | undefined;
  recordingSource: string;
}) => {
  page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS); // 2 minutes
  if (bypassCSP) {
    await page.setBypassCSP(true);
  }

  await bootstrapPage({
    page,
    recordingToken,
    appCommitHash: "unknown",
    recordingSnippetUrl,
    uploadIntervalMs: uploadIntervalMs || DEFAULT_UPLOAD_INTERVAL_MS,
    captureHttpOnlyCookies: captureHttpOnlyCookies ?? true,
    recordingSource,
  });
};

export const recordLoginFlowSession = async ({
  recordingToken,
  devTools,
  bypassCSP,
  recordingSnippetUrl,
  width,
  height,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  appUrl,
}: RecordLoginFlowOptions) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  logger.info("Opening browser...");

  const defaultViewport = width && height ? { width, height } : null;

  const browser: Browser = await launch({
    defaultViewport,
    headless: false,
    devtools: devTools || false,
    args: COMMON_RECORD_CHROME_LAUNCH_ARGS,
  });

  const context = await browser.createIncognitoBrowserContext();

  await Promise.all((await browser.pages()).map((page) => page.close()));

  const loginFlowPage = await context.newPage();

  let isRecordingComplete = false;
  let onDataSessionSaved = false;
  let startedLoginSessionRecording = false;

  const recordingCompleteCallback = defer();

  loginFlowPage.on("close", () => {
    if (!isRecordingComplete) {
      printPageClosedWarning();

      // Resolve the callback only if the page is closed before the recording is complete.
      // Cases where the page is closed after the recording is complete are handled
      // in the `__meticulousFinishRecording` callback.
      recordingCompleteCallback.resolve();
    }
  });

  // Expose login page functions
  await exposeNewRecordingCallback(loginFlowPage, ({ sessionId }) => {
    startedLoginSessionRecording = true;
    logger.debug(`Recording login flow: ${sessionId}`);
  });

  await loginFlowPage.exposeFunction(
    "__meticulousFinishRecording",
    async () => {
      logger.debug("Finish recording button clicked");
      const loginDataPage = await context.newPage();
      const finalLoginUrl = loginFlowPage.url();

      loginDataPage.on("close", () => {
        if (!onDataSessionSaved) {
          printPageClosedWarning();
        }
      });

      try {
        const recordingSavingScreenPage = await context.newPage();
        await recordingSavingScreenPage.goto(
          METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL
        );

        // Flush any pending payloads from the main login flow recording page and close it
        await flushPendingPayloads(loginFlowPage, logger);
        isRecordingComplete = true;
        await loginFlowPage.close();

        await exposeNewRecordingCallback(loginDataPage, ({ sessionId }) => {
          logger.debug(`Recording login data: ${sessionId}`);
        });

        await bootstrapLoginFlowRecordingPage({
          page: loginDataPage,
          recordingToken,
          recordingSnippetUrl,

          uploadIntervalMs: uploadIntervalMs,
          captureHttpOnlyCookies: captureHttpOnlyCookies,
          bypassCSP,
          recordingSource: LOGIN_FLOW_DATA_SESSION_RECORDING_SOURCE,
        });

        // Navigate to the final login flow url and flush any pending payloads
        logger.debug("Reloading page to capture application storage...");
        await loginDataPage.goto(finalLoginUrl, {
          waitUntil: "domcontentloaded",
        });
        await flushPendingPayloads(loginDataPage, logger);
        onDataSessionSaved = true;

        await loginDataPage.close();
      } catch (error) {
        logger.error(error);
      } finally {
        recordingCompleteCallback.resolve();
      }
    }
  );

  await injectFinishRecordingFrame(
    loginFlowPage,
    "__meticulousFinishRecording"
  );

  await bootstrapLoginFlowRecordingPage({
    page: loginFlowPage,
    recordingToken,
    recordingSnippetUrl,

    uploadIntervalMs,
    captureHttpOnlyCookies,
    bypassCSP,
    recordingSource: LOGIN_FLOW_SESSION_RECORDING_SOURCE,
  });

  await loginFlowPage.goto(
    appUrl ?? INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL
  );

  // Wait for the recording to complete or the page to close.
  await recordingCompleteCallback.promise;

  if (!loginFlowPage.isClosed()) {
    await loginFlowPage.close();
  }
  await context.close();
  await browser.close();

  if (!onDataSessionSaved || !isRecordingComplete) {
    throw new Error("Recording of login flow failed");
  }

  if (!startedLoginSessionRecording) {
    printNoLoginSessionRecordedWarning();
    throw new Error("Recording of login flow failed");
  }

  // Print green success message
  logger.info(
    chalk.green.bold("Recording complete!") +
      "\n" +
      chalk.green.bold(
        "Return to https://app.meticulous.ai to finish setting up your project."
      )
  );
};

const flushPendingPayloads = async (page: Page, logger: Logger) => {
  // evaluteHandle waits for the promise to resolve if the function returns a promise
  logger.debug("Flushing pending payloads...");
  const pendingPayloadsResult = await page.evaluateHandle(() => {
    const flushPendingPayloads = (window as ModifiedWindow).__meticulous
      ?.flushPendingPayloads;
    if (flushPendingPayloads == null) {
      throw new Error("Expected Meticulous recorder to be initialized");
    }
    return flushPendingPayloads();
  });
  await pendingPayloadsResult.dispose();
  logger.debug("Finished flushing pending payloads");
};
