import { join } from "path";
import { Page } from "puppeteer";
import { prepareScreenshotsDir } from "./replay.utils";

export interface TakeScreenshotOptions {
  page: Page;
  tempDir: string;
  screenshotSelector: string;
}

const screenshotPageOrElement: (options: {
  page: Page;
  path: string;
  screenshotSelector: string;
}) => Promise<void> = async ({ page, path, screenshotSelector }) => {
  const toScreenshot = screenshotSelector
    ? await page.$(screenshotSelector)
    : page;
  if (!toScreenshot) {
    console.log(`Error: could not find element (${screenshotSelector})`);
  }
  await (toScreenshot || page).screenshot({ path });
};

export const takeScreenshot: (
  options: TakeScreenshotOptions
) => Promise<void> = async ({ page, tempDir, screenshotSelector }) => {
  console.log("Taking screenshot");
  await prepareScreenshotsDir(tempDir);
  const screenshotFile = join(tempDir, "screenshots", "final-state.png");
  await screenshotPageOrElement({
    page,
    path: screenshotFile,
    screenshotSelector,
  });
  console.log(`Wrote screenshot to ${screenshotFile}`);
};
