import { readFile } from "fs/promises";
import type { ReplayDebuggerDependencies } from "@alwaysmeticulous/common";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { patchDate, getSessionStartTime } from "@alwaysmeticulous/replayer";
import { SessionData } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { BrowserContext, Page, Viewport } from "puppeteer";

export interface SetupPageCookiesOptions {
  page: Page;
  cookiesFile: string;
}

export const setupPageCookies: (
  options: SetupPageCookiesOptions
) => Promise<void> = async ({ page, cookiesFile }) => {
  const cookiesStr = await readFile(cookiesFile, "utf-8");
  const cookies = JSON.parse(cookiesStr) as any[];
  await page.setCookie(...cookies);
};

export interface BootstrapPageOptions {
  page: Page;
  sessionData: any;
  dependencies: ReplayDebuggerDependencies;
  shiftTime: boolean;
  networkStubbing: boolean;
}

export const createDebugReplayPage: (options: {
  context: BrowserContext;
  defaultViewport: Viewport;
  sessionData: SessionData;
  shiftTime: boolean;
  dependencies: ReplayDebuggerDependencies;
}) => Promise<Page> = async ({
  context,
  defaultViewport,
  sessionData,
  shiftTime,
  dependencies,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const page = await context.newPage();
  logger.debug("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

  // Set viewport
  await page.setViewport(defaultViewport);

  // Shift simulation time by patching the Date class
  if (shiftTime) {
    const sessionStartTime = getSessionStartTime(sessionData);
    await patchDate({ page, sessionStartTime });
  }

  // Disable the recording snippet
  await page.evaluateOnNewDocument(`
    window["METICULOUS_DISABLED"] = true;
    window.__meticulous = window.__meticulous || {};
  `);

  // Setup the user-interactions snippet
  const userInteractionsFile = await readFile(
    dependencies.browserUserInteractions.location,
    "utf-8"
  );
  await page.evaluateOnNewDocument(userInteractionsFile);

  return page;
};
