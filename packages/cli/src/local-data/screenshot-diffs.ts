import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import { mkdir } from "fs/promises";
import { join } from "path";
import { PNG } from "pngjs";
import { writePng } from "../image/io.utils";

export const writeScreenshotDiff: (options: {
  baseReplayId: string;
  headReplayId: string;
  diff: PNG;
}) => Promise<void> = async ({ baseReplayId, headReplayId, diff }) => {
  const diffDir = join(getMeticulousLocalDataDir(), "screenshot-diffs");
  await mkdir(diffDir, { recursive: true });
  const diffFile = join(diffDir, `${baseReplayId}+${headReplayId}.png`);

  await writePng(diff, diffFile);
  console.log(`Screenshot diff written to ${diffFile}`);
};
