import { readFile } from "fs/promises";
import puppeteer, { Browser } from "puppeteer";
import { SessionData } from "../session/session.types";
import { createReplayDebuggerUI } from "./replay-debugger.ui";
import { getStartUrl, ReplayEventsDependencies } from "./replay.utils";

export const createReplayer: (options: {
  sessionData: SessionData;
  appUrl: string;
  devTools: boolean;
  dependencies: ReplayEventsDependencies;
}) => Promise<any> = async ({
  sessionData,
  appUrl,
  devTools,
  dependencies,
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

  // Inject replay debug snippet
  await page.evaluateOnNewDocument(
    await readFile(dependencies.replayDebugger.location, "utf-8")
  );

  const startUrl = getStartUrl({ sessionData, appUrl });
  console.log(`Navigating to ${startUrl}...`);
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  const status = res.status();
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
