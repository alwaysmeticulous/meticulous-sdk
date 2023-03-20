import { join } from "path";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { Page } from "puppeteer";
import { prepareScreenshotsDir } from "./output.utils";

export interface TakeScreenshotOptions {
  page: Page;
  outputDir: string;
  screenshotSelector: string | null;
}

const screenshotPageOrElement: (options: {
  page: Page;
  path: string;
  screenshotSelector: string | null;
}) => Promise<void> = async ({ page, path, screenshotSelector }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (!screenshotSelector) {
    await page.screenshot({ path });
    return;
  }

  const toScreenshot = await page.$(screenshotSelector);
  if (!toScreenshot) {
    logger.warn(`Error: could not find element (${screenshotSelector})`);

    await page.screenshot({ path });
    return;
  }

  await toScreenshot.screenshot({ path });
};

export const takeScreenshot: (
  options: TakeScreenshotOptions
) => Promise<void> = async ({ page, outputDir, screenshotSelector }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.debug("Taking screenshot");
  const screenshotsDir = await prepareScreenshotsDir(outputDir);
  const screenshotFile = join(screenshotsDir, "final-state.png");
  await screenshotPageOrElement({
    page,
    path: screenshotFile,
    screenshotSelector,
  });
  logger.debug(`Wrote screenshot to ${screenshotFile}`);
};
