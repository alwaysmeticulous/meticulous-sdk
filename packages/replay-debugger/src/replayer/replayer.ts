import {
  CreateReplayDebuggerFn,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { getStartUrl } from "@alwaysmeticulous/replayer";
import log from "loglevel";
import { Browser, launch } from "puppeteer";
import { bootstrapPage, setupPageCookies } from "./debugger.utils";
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
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const { width, height } = sessionData.userEvents.window;
  const defaultViewport = { width, height };

  const browser: Browser = await launch({
    defaultViewport,
    args: [
      `--window-size=${width},${height}`,
      "--disable-features=Translate",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-default-apps",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-notifications",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--no-first-run",
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

  const page = await replayContext.newPage();
  logger.debug("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

  // Set viewport
  await page.setViewport({
    width: width,
    height: height,
  });

  // Bootstrap page
  await bootstrapPage({
    page,
    sessionData,
    dependencies,
    shiftTime,
    networkStubbing,
  });

  if (cookiesFile) {
    await setupPageCookies({ page, cookiesFile });
  }

  const startUrl = getStartUrl({ session, sessionData, appUrl });
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
