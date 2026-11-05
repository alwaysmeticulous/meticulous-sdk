import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ensureBrowser } from "@alwaysmeticulous/browser-installer";
import { initLogger } from "@alwaysmeticulous/common";
import type { Browser, Page, PuppeteerNode } from "puppeteer-core";
import puppeteer, { launch } from "puppeteer-core";
import type { RecordSessionOptions, RecordStorageToSeed } from "../types";
import {
  buildRecordChromeLaunchArgs,
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
}: RecordSessionOptions) => {
  const logger = initLogger();

  if (storageToSeed && !appUrl) {
    throw new Error("storageToSeed requires appUrl");
  }
  const cookieDirToSync = storageToSeed ? null : cookieDir;

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

    const execPath = await (puppeteer as any as PuppeteerNode).executablePath();
    debugLogger.log("Puppeteer browser:");
    debugLogger.log(execPath);
  }

  const defaultViewport = width && height ? { width, height } : null;

  // Incognito browser contexts are not visible to external CDP clients (e.g.
  // agent-browser connect). Force the default context when exposing a debug port.
  const useIncognito = remoteDebuggingPort != null ? false : Boolean(incognito);
  if (remoteDebuggingPort != null && incognito) {
    logger.info(
      "Disabling incognito mode because --remoteDebuggingPort requires the default browser context for external agents.",
    );
  }

  const executablePath = await ensureBrowser();
  const browser: Browser = await launch({
    executablePath,
    defaultViewport,
    headless: headless ?? false,
    devtools: devTools || false,
    // External agents need WebSocket CDP access via --remote-debugging-port.
    ...(remoteDebuggingPort != null ? { pipe: false } : {}),
    args: buildRecordChromeLaunchArgs(remoteDebuggingPort),
  });

  const context = useIncognito
    ? await browser.createBrowserContext()
    : browser.defaultBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) => {
    void page.close();
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS); // 2 minutes
  if (maxPayloadSize) {
    await page.evaluateOnNewDocument((maxPayloadSize) => {
      (window as any).METICULOUS_MAX_PAYLOAD_SIZE = maxPayloadSize;
    }, maxPayloadSize);
  }

  if (bypassCSP) {
    await page.setBypassCSP(true);
  }

  if (storageToSeed?.cookies.length) {
    await context.setCookie(...storageToSeed.cookies);
  }
  const seedLocalStorageScriptId =
    storageToSeed && appUrl
      ? await seedLocalStorageOnFirstLoad(page, storageToSeed, appUrl)
      : null;

  // Restore cookies when not in incognito context
  if (!useIncognito && cookieDirToSync) {
    await mkdir(cookieDirToSync, { recursive: true });
    const cookiesStr = await readFile(
      join(cookieDirToSync, COOKIE_FILENAME),
      "utf-8",
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
    workerRecordingSnippet,
    uploadIntervalMs: uploadIntervalMs || DEFAULT_UPLOAD_INTERVAL_MS,
    captureHttpOnlyCookies: captureHttpOnlyCookies ?? true,
  });

  await page.goto(appUrl ?? INITIAL_METICULOUS_RECORD_DOCS_URL);
  if (seedLocalStorageScriptId) {
    await page.removeScriptToEvaluateOnNewDocument(seedLocalStorageScriptId);
  }

  logger.info("Browser ready");
  if (remoteDebuggingPort != null) {
    logger.info(
      `Remote debugging enabled on port ${remoteDebuggingPort}. Connect an agent with: agent-browser connect ${remoteDebuggingPort}`,
    );
    logger.info(`Recording page URL: ${page.url()}`);
  }

  // Collect and show recorded session ids
  // Also save page cookies if not in incognito context
  const sessionIds: string[] = [];
  const interval = setInterval(() => {
    void (async () => {
      try {
        const sessionId = await page.evaluate<[], () => string | undefined>(
          "window?.__meticulous?.config?.sessionId",
        );
        if (sessionId && !sessionIds.find((id) => id === sessionId)) {
          sessionIds.push(sessionId);
          if (onDetectedSession) {
            onDetectedSession(sessionId);
          }
        }
        if (!useIncognito && cookieDirToSync) {
          const cookies = await page.cookies();
          await writeFile(
            join(cookieDirToSync, COOKIE_FILENAME),
            JSON.stringify(cookies, null, 2),
            "utf-8",
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
    })();
  }, 1000);

  await closePromise;

  clearInterval(interval);

  await browser.close();
};

/**
 * Registered before the recorder snippet so the snippet and the app see the seeded
 * entries; removed after the first navigation so later loads keep the app's own
 * changes (e.g. a logout or a refreshed token).
 */
const seedLocalStorageOnFirstLoad = async (
  page: Page,
  storageToSeed: RecordStorageToSeed,
  appUrl: string,
): Promise<string | null> => {
  if (storageToSeed.localStorageEntries.length === 0) {
    return null;
  }
  const { identifier } = await page.evaluateOnNewDocument(
    (origin: string, entries: { key: string; value: string }[]) => {
      if (window.location.origin !== origin) {
        return;
      }
      for (const { key, value } of entries) {
        window.localStorage.setItem(key, value);
      }
    },
    new URL(appUrl).origin,
    storageToSeed.localStorageEntries,
  );
  return identifier;
};
