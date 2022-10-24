import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { join } from "path";
import { Page } from "puppeteer";
import { prepareScreenshotsDir } from "./output.utils";

export interface TakeScreenshotOptions {
  page: Page;
  outputDir: string;
  screenshotSelector: string | undefined;
}

const screenshotPageOrElement: (options: {
  page: Page;
  path: string;
  screenshotSelector: string | undefined;
}) => Promise<void> = async ({ page, path, screenshotSelector }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const toScreenshot = screenshotSelector
    ? await page.$(screenshotSelector)
    : page;
  if (!toScreenshot) {
    logger.warn(`Error: could not find element (${screenshotSelector})`);
  }
  await (toScreenshot || page).screenshot({ path });
};

export const takeScreenshot: (
  options: TakeScreenshotOptions
) => Promise<void> = async ({ page, outputDir, screenshotSelector }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  logger.debug("Taking screenshot");
  await prepareScreenshotsDir(outputDir);
  const screenshotFile = join(outputDir, "screenshots", "final-state.png");
  await screenshotPageOrElement({
    page,
    path: screenshotFile,
    screenshotSelector,
  });
  logger.debug(`Wrote screenshot to ${screenshotFile}`);
};
