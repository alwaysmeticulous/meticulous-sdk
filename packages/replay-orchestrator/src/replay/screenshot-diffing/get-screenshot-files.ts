import { opendir } from "fs/promises";
import { ScreenshotIdentifier } from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { getScreenshotIdentifier } from "./utils/get-screenshot-identifier";

export interface IdentifiedScreenshotFile {
  identifier: ScreenshotIdentifier;
  fileName: string;
}

export const getScreenshotFiles: (
  screenshotsDirPath: string
) => Promise<IdentifiedScreenshotFile[]> = async (screenshotsDirPath) => {
  const screenshotFiles: IdentifiedScreenshotFile[] = [];
  const screenshotsDir = await opendir(screenshotsDirPath);
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  for await (const dirEntry of screenshotsDir) {
    if (!dirEntry.isFile() || !dirEntry.name.endsWith(".png")) {
      continue;
    }
    const identifier = getScreenshotIdentifier(dirEntry.name);
    if (identifier == null) {
      logger.error(
        `Ignoring screenshot file with unrecognized name pattern: ${dirEntry.name}`
      );
      continue;
    }
    screenshotFiles.push({ identifier, fileName: dirEntry.name });
  }

  // Sort files alphabetically to help when reading results.
  return screenshotFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
};
