import {
  defer,
  METICULOUS_LOGGER_NAME,
  RecordLoginFlowSessionFn,
} from "@alwaysmeticulous/common";
import chalk from "chalk";
import log from "loglevel";
import { Browser, launch } from "puppeteer";
import {
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
  printPageCloseWarning,
} from "./utils/print-page-close-warning";

type ModifiedWindow = {
  __meticulous?: {
    flushPendingPayloads?: () => Promise<void>;
  };
};

export const LOGIN_FLOW_SESSION_RECORDING_SOURCE = "cli-login-flow";
export const LOGIN_FLOW_DATA_SESSION_RECORDING_SOURCE = "cli-login-flow-data";

const bootstrapLoginFlowRecordingPage = async ({
  page,
  recordingToken,
  recordingSnippet,
  earlyNetworkRecorderSnippet,
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
    recordingSnippet,
    earlyNetworkRecorderSnippet,
    uploadIntervalMs: uploadIntervalMs || DEFAULT_UPLOAD_INTERVAL_MS,
    captureHttpOnlyCookies: captureHttpOnlyCookies ?? true,
    recordingSource,
  });
};

export const recordLoginFlowSession: RecordLoginFlowSessionFn = async ({
  recordingToken,
  devTools,
  bypassCSP,
  recordingSnippet,
  earlyNetworkRecorderSnippet,
  width,
  height,
  uploadIntervalMs,
  captureHttpOnlyCookies,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  logger.info("Opening browser...");

  const defaultViewport = width && height ? { width, height } : null;

  const browser: Browser = await launch({
    defaultViewport,
    headless: false,
    devtools: devTools || false,
  });

  const context = await browser.createIncognitoBrowserContext();

  await Promise.all((await browser.pages()).map((page) => page.close()));

  const loginFlowPage = await context.newPage();

  await bootstrapLoginFlowRecordingPage({
    page: loginFlowPage,
    recordingToken,
    recordingSnippet,
    earlyNetworkRecorderSnippet,
    uploadIntervalMs,
    captureHttpOnlyCookies,
    bypassCSP,
    recordingSource: LOGIN_FLOW_SESSION_RECORDING_SOURCE,
  });

  let isRecordingComplete = false;
  let onDataSessionSaved = false;
  let startedLoginSessionRecording = false;

  const recordingCompleteCallback = defer();

  loginFlowPage.on("close", () => {
    if (!isRecordingComplete) {
      printPageCloseWarning();

      // Resolve the callback only if the page is closed before the recording is complete.
      // Cases where the page is closed after the recording is complete are handled
      // in the `__meticulousFinishRecording` callback.
      recordingCompleteCallback.resolve();
    }
  });

  // Expose login page functions
  await exposeNewRecordingCallback(loginFlowPage, () => {
    startedLoginSessionRecording = true;
  });

  await loginFlowPage.exposeFunction(
    "__meticulousFinishRecording",
    async () => {
      const loginDataPage = await context.newPage();
      const finalLoginUrl = loginFlowPage.url();

      loginDataPage.on("close", () => {
        if (!onDataSessionSaved) {
          printPageCloseWarning();
        }
      });

      try {
        const recordingSavingScreenPage = await context.newPage();
        await recordingSavingScreenPage.goto(
          METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL
        );

        // Flush any pending payloads from the main login flow recording page and close it
        await loginFlowPage.evaluate(() => {
          (window as ModifiedWindow).__meticulous?.flushPendingPayloads?.();
        });
        isRecordingComplete = true;
        await loginFlowPage.close();

        await bootstrapLoginFlowRecordingPage({
          page: loginDataPage,
          recordingToken,
          recordingSnippet,
          earlyNetworkRecorderSnippet,
          uploadIntervalMs: uploadIntervalMs,
          captureHttpOnlyCookies: captureHttpOnlyCookies,
          bypassCSP,
          recordingSource: LOGIN_FLOW_DATA_SESSION_RECORDING_SOURCE,
        });

        // Navigate to the final login flow url and flush any pending payloads
        await loginDataPage.goto(finalLoginUrl, { waitUntil: "networkidle0" });
        await loginDataPage.evaluate(() => {
          (window as ModifiedWindow).__meticulous?.flushPendingPayloads?.();
        });
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

  await loginFlowPage.goto(INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL);

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
