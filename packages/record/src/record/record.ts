import type { DebugLogger } from "@alwaysmeticulous/common";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import puppeteer, { Browser, PuppeteerNode } from "puppeteer";
import { bootstrapPage, defer } from "./record.utils";

const DEFAULT_UPLOAD_INTERVAL_MS = 1_000; // 1 second
const COOKIE_FILENAME = "cookies.json";

export interface RecordSessionOptions {
  browser: any;
  project: any;
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  verbose?: boolean | null | undefined;
  recordingSnippet: string;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  cookieDir?: string | null | undefined;
  logger?: DebugLogger | null | undefined;
  onDetectedSession?: (sessionId: string) => void;
}

export const recordSession: (
  options: RecordSessionOptions
) => Promise<void> = async ({
  browser: browser_,
  project,
  recordingToken,
  appCommitHash,
  devTools,
  recordingSnippet,
  width,
  height,
  uploadIntervalMs,
  incognito,
  cookieDir,
  logger,
  onDetectedSession,
}) => {
  console.log("Opening browser...");

  logger?.log("recordSession options:");
  logger?.logObject({
    browser: !!browser_,
    project,
    recordingToken,
    appCommitHash,
    devTools,
    recordingSnippet,
    width,
    height,
    uploadIntervalMs,
    incognito,
    cookieDir,
    logger: !!logger,
    onDetectedSession: !!onDetectedSession,
  });

  if (logger) {
    const puppeteerEnv = {
      HTTP_PROXY: process.env["HTTP_PROXY"],
      HTTPS_PROXY: process.env["HTTPS_PROXY"],
      NO_PROXY: process.env["NO_PROXY"],
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:
        process.env["PUPPETEER_SKIP_CHROMIUM_DOWNLOAD"],
      PUPPETEER_TMP_DIR: process.env["PUPPETEER_TMP_DIR"],
      PUPPETEER_DOWNLOAD_HOST: process.env["PUPPETEER_DOWNLOAD_HOST"],
      PUPPETEER_DOWNLOAD_PATH: process.env["PUPPETEER_DOWNLOAD_PATH"],
      PUPPETEER_PRODUCT: process.env["PUPPETEER_PRODUCT"],
      PUPPETEER_EXPERIMENTAL_CHROMIUM_MAC_ARM:
        process.env["PUPPETEER_EXPERIMENTAL_CHROMIUM_MAC_ARM"],
    };
    logger.log("Puppeteer env:");
    logger.logObject(puppeteerEnv);

    const execPath = (puppeteer as any as PuppeteerNode).executablePath();
    logger.log("Puppeteer browser:");
    logger.log(execPath);
  }

  const defaultViewport = width && height ? { width, height } : null;

  const browser: Browser =
    browser_ ||
    (await puppeteer.launch({
      defaultViewport,
      headless: false,
      devtools: devTools || false,
    }));

  const context = incognito
    ? await browser.createIncognitoBrowserContext()
    : browser.defaultBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close()
  );

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000); // 2 minutes

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

  const closePromise = defer();
  page.on("close", () => closePromise.resolve());

  await bootstrapPage({
    page,
    recordingToken,
    appCommitHash,
    recordingSnippet,
    uploadIntervalMs: uploadIntervalMs || DEFAULT_UPLOAD_INTERVAL_MS,
  });

  console.log("Browser ready");

  // Collect and show recorded session ids
  // Also save page cookies if not in incognito context
  const sessionIds: string[] = [];
  const interval = setInterval(async () => {
    try {
      const sessionId = await page.evaluate(
        "window?.__meticulous?.config?.sessionId"
      );
      if (sessionId && !sessionIds.find((id) => id === sessionId)) {
        sessionIds.push(sessionId);
        const organizationName = encodeURIComponent(project.organization.name);
        const projectName = encodeURIComponent(project.name);
        console.log(`Recording session ${sessionId}`);
        console.log(
          `Link: https://app.meticulous.ai/projects/${organizationName}/${projectName}/sessions/${sessionId}`
        );
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
      console.error(error);
    }
  }, 1000);

  await closePromise.promise;

  clearInterval(interval);
};
