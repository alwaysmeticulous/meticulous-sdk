import puppeteer, { Browser } from "puppeteer";
import { bootstrapPage, defer } from "./record.utils";

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
  onDetectedSession,
}) => {
  const defaultViewport = width && height ? { width, height } : null;

  const browser: Browser =
    browser_ ||
    (await puppeteer.launch({
      defaultViewport,
      headless: false,
      devtools: devTools || false,
    }));

  const context = await browser.createIncognitoBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close()
  );

  const page = await context.newPage();
  console.log("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

  const closePromise = defer();
  page.on("close", () => closePromise.resolve());

  await bootstrapPage(page, recordingToken, appCommitHash, recordingSnippet);

  // Collect and show recorded session ids
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
    } catch (error) {}
  }, 1000);

  await closePromise.promise;

  clearInterval(interval);
};
