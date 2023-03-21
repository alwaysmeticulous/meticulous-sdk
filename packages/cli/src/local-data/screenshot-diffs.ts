import { mkdir } from "fs/promises";
import { join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { PNG } from "pngjs";
import { writePng } from "../image/io.utils";

export const writeScreenshotDiff: (options: {
  baseReplayId: string;
  headReplayId: string;
  screenshotFileName: string;
  diff: PNG;
}) => Promise<void> = async ({
  baseReplayId,
  headReplayId,
  screenshotFileName,
  diff,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const diffDir = join(getMeticulousLocalDataDir(), "screenshot-diffs");
  await mkdir(diffDir, { recursive: true });
  const diffFile = join(
    diffDir,
    `${baseReplayId}-vs-${headReplayId}-${screenshotFileName}.png`
  );

  await writePng(diff, diffFile);
  logger.debug(`Screenshot diff written to ${diffFile}`);
};
