import type { CreateReplayDebuggerFn } from "@alwaysmeticulous/common";
import { getStartUrl } from "@alwaysmeticulous/replayer";
import puppeteer, { Browser } from "puppeteer";
import { bootstrapPage, setupPageCookies } from "./debugger.utils";
import { createReplayDebuggerUI } from "./replay-debugger.ui";

export const createReplayer: CreateReplayDebuggerFn = async ({
  sessionData,
  appUrl,
  devTools,
  dependencies,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
}) => {
  const { width, height } = sessionData.userEvents.window;
  const defaultViewport = { width, height };

  const browser: Browser = await puppeteer.launch({
    defaultViewport,
    args: [`--window-size=${width},${height}`],
    headless: false,
    devtools: devTools,
  });

  const replayContext = await browser.createIncognitoBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      console.error(error);
    })
  );

  const page = await replayContext.newPage();
  console.log("Created page");
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
    networkStubbing,
  });

  if (cookiesFile) {
    await setupPageCookies({ page, cookiesFile });
  }

  const startUrl = getStartUrl({ sessionData, appUrl });
  console.log(`Navigating to ${startUrl}...`);
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  const status = res && res.status();
  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`
    );
  }
  console.log(`Navigated to ${startUrl}`);

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
