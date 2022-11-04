import {
  COMMON_CHROMIUM_FLAGS,
  CreateReplayDebuggerFn,
  METICULOUS_LOGGER_NAME,
  SessionData,
} from "@alwaysmeticulous/common";
import {
  getStartUrl,
  getOriginalSessionStartUrl,
} from "@alwaysmeticulous/replayer";
import { OnReplayTimelineEventFn } from "@alwaysmeticulous/sdk-bundles-api";
import log, { LogLevelDesc } from "loglevel";
import { Browser, launch, Page } from "puppeteer";
import { createDebugReplayPage, setupPageCookies } from "./debugger.utils";
import { createReplayDebuggerUI } from "./replay-debugger.ui";

export const createReplayer: CreateReplayDebuggerFn = async ({
  session,
  sessionData,
  appUrl,
  devTools,
  dependencies,
  shiftTime,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
  disableRemoteFonts,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const logLevel: LogLevelDesc = logger.getLevel();

  const { width, height } = sessionData.userEvents.window;
  const defaultViewport = { width, height };

  const browser: Browser = await launch({
    defaultViewport,
    args: [
      `--window-size=${width},${height}`,
      // This disables cross-origin security. We need this in order to disable CORS for replayed network requests,
      // including the respective Preflgiht CORS requests which are not handled by the network stubbing layer.
      "--disable-web-security",
      ...COMMON_CHROMIUM_FLAGS,
      ...(disableRemoteFonts ? ["--disable-remote-fonts"] : []),
    ],
    headless: false,
    devtools: devTools,
  });

  const replayContext = await browser.createIncognitoBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      logger.error(error);
    })
  );

  const page = await createDebugReplayPage({
    context: replayContext,
    defaultViewport,
    sessionData,
    shiftTime,
    dependencies,
  });

  if (cookiesFile) {
    await setupPageCookies({ page, cookiesFile });
  }

  const originalSessionStartUrl = getOriginalSessionStartUrl({
    session,
    sessionData,
  });
  const startUrl = getStartUrl({ originalSessionStartUrl, appUrl });

  // Set-up network stubbing if required
  if (networkStubbing) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const networkStubbingModule = require(dependencies.nodeNetworkStubbing
      .location);
    const setupReplayNetworkStubbing =
      networkStubbingModule.setupReplayNetworkStubbing as (options: {
        page: Page;
        logLevel: LogLevelDesc;
        sessionData: SessionData;
        startUrl: string;
        originalSessionStartUrl: string;
        onTimelineEvent: OnReplayTimelineEventFn;
      }) => Promise<void>;
    await setupReplayNetworkStubbing({
      page,
      logLevel,
      sessionData,
      startUrl,
      originalSessionStartUrl: originalSessionStartUrl.toString(),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onTimelineEvent: () => {},
    });
  }

  logger.debug(`Navigating to ${startUrl}...`);
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  const status = res && res.status();
  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`
    );
  }
  logger.debug(`Navigated to ${startUrl}`);

  const replayableEvents = sessionData.userEvents.event_log;

  const replayDebuggerUI = await createReplayDebuggerUI({
    browser,
    replayedPage: page,
    replayableEvents,
    moveBeforeClick,
  });

  // Close all pages if one of them is closed
  page.on("close", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    replayDebuggerUI.page.close().catch(() => {});
  });
  replayDebuggerUI.page.on("close", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    page.close().catch(() => {});
  });
};
