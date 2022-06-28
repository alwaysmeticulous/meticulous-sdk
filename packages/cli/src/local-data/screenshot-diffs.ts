import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import { mkdir } from "fs/promises";
import { join } from "path";
import { PNG } from "pngjs";
import log from "loglevel";
import { writePng } from "../image/io.utils";

export const writeScreenshotDiff: (options: {
  baseReplayId: string;
  headReplayId: string;
  diff: PNG;
}) => Promise<void> = async ({ baseReplayId, headReplayId, diff }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const diffDir = join(getMeticulousLocalDataDir(), "screenshot-diffs");
  await mkdir(diffDir, { recursive: true });
  const diffFile = join(diffDir, `${baseReplayId}+${headReplayId}.png`);

  await writePng(diff, diffFile);
  logger.debug(`Screenshot diff written to ${diffFile}`);
};
