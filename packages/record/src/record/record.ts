import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import puppeteer, { Browser, launch, PuppeteerNode } from "puppeteer";
import { RecordSessionOptions } from "../types";
import {
  COMMON_RECORD_CHROME_LAUNCH_ARGS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DEFAULT_UPLOAD_INTERVAL_MS,
  INITIAL_METICULOUS_RECORD_DOCS_URL,
} from "./constants";
import { bootstrapPage } from "./record.utils";

const COOKIE_FILENAME = "cookies.json";

export const recordSession = async ({
  recordingToken,
  appCommitHash,
  devTools,
  bypassCSP,
  recordingSnippet,
  width,
  height,
  uploadIntervalMs,
  incognito,
  cookieDir,
  debugLogger,
  onDetectedSession,
  captureHttpOnlyCookies,
  appUrl,
}: RecordSessionOptions) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  logger.info("Opening browser...");

  debugLogger?.log("recordSession options:");
  debugLogger?.logObject({
    recordingToken,
    appCommitHash,
    devTools,
    bypassCSP,
    recordingSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    debugLogger: !!debugLogger,
    onDetectedSession: !!onDetectedSession,
  });

  if (debugLogger) {
    const puppeteerEnv = {
      HTTP_PROXY: process.env["HTTP_PROXY"],
      HTTPS_PROXY: process.env["HTTPS_PROXY"],
      NO_PROXY: process.env["NO_PROXY"],
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:
        process.env["PUPPETEER_SKIP_CHROMIUM_DOWNLOAD"],
      PUPPETEER_SKIP_DOWNLOAD: process.env["PUPPETEER_SKIP_DOWNLOAD"],
      PUPPETEER_TMP_DIR: process.env["PUPPETEER_TMP_DIR"],
      PUPPETEER_DOWNLOAD_HOST: process.env["PUPPETEER_DOWNLOAD_HOST"],
      PUPPETEER_DOWNLOAD_PATH: process.env["PUPPETEER_DOWNLOAD_PATH"],
      PUPPETEER_PRODUCT: process.env["PUPPETEER_PRODUCT"],
      PUPPETEER_EXPERIMENTAL_CHROMIUM_MAC_ARM:
        process.env["PUPPETEER_EXPERIMENTAL_CHROMIUM_MAC_ARM"],
    };
    debugLogger.log("Puppeteer env:");
    debugLogger.logObject(puppeteerEnv);

    const execPath = (puppeteer as any as PuppeteerNode).executablePath();
    debugLogger.log("Puppeteer browser:");
    debugLogger.log(execPath);
  }

  const defaultViewport = width && height ? { width, height } : null;

  const browser: Browser = await launch({
    defaultViewport,
    headless: false,
    devtools: devTools || false,
    args: COMMON_RECORD_CHROME_LAUNCH_ARGS,
  });

  const context = incognito
    ? await browser.createBrowserContext()
    : browser.defaultBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close()
  );

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS); // 2 minutes

  if (bypassCSP) {
    await page.setBypassCSP(true);
  }

  // Restore cookies when not in incognito context
  if (!incognito && cookieDir) {
    await mkdir(cookieDir, { recursive: true });
    const cookiesStr = await readFile(
      join(cookieDir, COOKIE_FILENAME),
      "utf-8"
    ).catch(() => "");
    if (cookiesStr) {
      const cookies = JSON.parse(cookiesStr);
      await page.setCookie(...cookies);
    }
  }

  const closePromise = new Promise<void>((resolve) => {
    page.on("close", resolve);
  });

  await bootstrapPage({
    page,
    recordingToken,
    appCommitHash,
    recordingSnippet,
    uploadIntervalMs: uploadIntervalMs || DEFAULT_UPLOAD_INTERVAL_MS,
    captureHttpOnlyCookies: captureHttpOnlyCookies ?? true,
  });

  await page.goto(appUrl ?? INITIAL_METICULOUS_RECORD_DOCS_URL);

  logger.info("Browser ready");

  // Collect and show recorded session ids
  // Also save page cookies if not in incognito context
  const sessionIds: string[] = [];
  const interval = setInterval(async () => {
    try {
      const sessionId = await page.evaluate<[], () => string | undefined>(
        "window?.__meticulous?.config?.sessionId"
      );
      if (sessionId && !sessionIds.find((id) => id === sessionId)) {
        sessionIds.push(sessionId);
        if (onDetectedSession) {
          onDetectedSession(sessionId);
        }
      }
      if (!incognito && cookieDir) {
        const cookies = await page.cookies();
        await writeFile(
          join(cookieDir, COOKIE_FILENAME),
          JSON.stringify(cookies, null, 2),
          "utf-8"
        );
      }
    } catch (error) {
      // Suppress expected errors due to page navigation
      if (
        error instanceof Error &&
        error.message.startsWith("Execution context was destroyed")
      ) {
        return;
      }
      logger.error(error);
    }
  }, 1000);

  await closePromise;

  clearInterval(interval);

  await browser.close();
};
