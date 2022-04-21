import puppeteer, { Browser } from "puppeteer";
import { bootstrapPage, defer } from "./record.utils";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

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
  onDetectedSession,
}) => {
  console.log("Opening browser...");

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
        console.log(`Recording session ${sessionId}`);
        console.log(
          `Link: https://app.meticulous.ai/projects/${project.organization.name}/${project.name}/sessions/${sessionId}`
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
    } catch (error) {}
  }, 1000);

  await closePromise.promise;

  clearInterval(interval);
};
