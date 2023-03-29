import { basename } from "path";
import {
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import log from "loglevel";

export const logDifferences = ({
  results,
  diffOptions,
  logger,
}: {
  results: ScreenshotDiffResult[];
  diffOptions: ScreenshotDiffOptions;
  logger: log.Logger;
}) => {
  const missingHeadImagesResults = results.flatMap((result) =>
    result.outcome === "missing-head" ? [result] : []
  );
  if (missingHeadImagesResults.length) {
    const message = `Head replay is missing screenshots: ${missingHeadImagesResults
      .map(({ baseScreenshotFile }) => basename(baseScreenshotFile))
      .sort()} => FAIL!`;
    logger.info(message);
  }

  const missingBaseImagesResults = results.flatMap((result) =>
    result.outcome === "missing-base" ? [result] : []
  );
  if (missingHeadImagesResults.length) {
    const message = `Notice: Base replay is missing screenshots: ${missingBaseImagesResults
      .map(({ headScreenshotFile }) => basename(headScreenshotFile))
      .sort()}`;
    logger.info(message);
  }

  results.forEach((result) => {
    const { outcome } = result;

    if (outcome === "different-size") {
      const message = `Screenshots ${basename(
        result.headScreenshotFile
      )} have different sizes => FAIL!`;
      logger.info(message);
    }

    if (outcome === "diff" || outcome === "no-diff") {
      const mismatch = (result.mismatchFraction * 100).toFixed(3);
      const threshold = (diffOptions.diffThreshold * 100).toFixed(3);
      const message = `${mismatch}% pixel mismatch for screenshot ${basename(
        result.headScreenshotFile
      )} (threshold is ${threshold}%) => ${
        outcome === "no-diff" ? "PASS" : "FAIL!"
      }`;
      logger.info(message);
    }
  });
};
