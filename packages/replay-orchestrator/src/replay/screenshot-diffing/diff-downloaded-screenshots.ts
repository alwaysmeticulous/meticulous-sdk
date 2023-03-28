import { join } from "path";
import {
  ScreenshotDiffOptions,
  ScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import stringify from "fast-json-stable-stringify";
import { compareImages } from "../../image/diff.utils";
import { readPng } from "../../image/io.utils";
import { IdentifiedScreenshotFile } from "./get-screenshot-files";
import { writeScreenshotDiff } from "./write-screenshot-diff";

export const diffDownloadedScreenshots = async ({
  headReplayId,
  baseReplayId,
  baseScreenshotsDir,
  headScreenshotsDir,
  baseReplayScreenshots,
  headReplayScreenshots,
  diffOptions,
}: {
  baseReplayId: string;
  headReplayId: string;
  baseScreenshotsDir: string;
  headScreenshotsDir: string;
  baseReplayScreenshots: IdentifiedScreenshotFile[];
  headReplayScreenshots: IdentifiedScreenshotFile[];
  diffOptions: ScreenshotDiffOptions;
}): Promise<ScreenshotDiffResult[]> => {
  const { diffThreshold, diffPixelThreshold } = diffOptions;

  const headReplayScreenshotsByIdentifier = new Map<
    string,
    IdentifiedScreenshotFile
  >(
    headReplayScreenshots.map((screenshot) => [
      stringify(screenshot.identifier),
      screenshot,
    ])
  );
  const baseReplayScreenshotsByIdentifier = new Map<
    string,
    IdentifiedScreenshotFile
  >(
    baseReplayScreenshots.map((screenshot) => [
      stringify(screenshot.identifier),
      screenshot,
    ])
  );

  const missingHeadImages = new Set(
    baseReplayScreenshots.filter(
      (file) =>
        !headReplayScreenshotsByIdentifier.has(stringify(file.identifier))
    )
  );

  const missingHeadImagesResults: ScreenshotDiffResult[] = Array.from(
    missingHeadImages
  ).flatMap(({ identifier, fileName }) => {
    return [
      {
        identifier,
        outcome: "missing-head",
        baseScreenshotFile: `screenshots/${fileName}`,
      },
    ];
  });

  const diffAgainstBase = async (
    headScreenshot: IdentifiedScreenshotFile
  ): Promise<ScreenshotDiffResult[]> => {
    const baseScreenshot = baseReplayScreenshotsByIdentifier.get(
      stringify(headScreenshot.identifier)
    );
    if (baseScreenshot == null) {
      return [
        {
          identifier: headScreenshot.identifier,
          outcome: "missing-base",
          headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
        },
      ];
    }

    const baseScreenshotFile = join(
      baseScreenshotsDir,
      baseScreenshot.fileName
    );
    const headScreenshotFile = join(
      headScreenshotsDir,
      headScreenshot.fileName
    );
    const baseScreenshotContents = await readPng(baseScreenshotFile);
    const headScreenshotContents = await readPng(headScreenshotFile);

    if (
      baseScreenshotContents.width !== headScreenshotContents.width ||
      baseScreenshotContents.height !== headScreenshotContents.height
    ) {
      return [
        {
          identifier: headScreenshot.identifier,
          outcome: "different-size",
          baseScreenshotFile: `screenshots/${baseScreenshot.fileName}`,
          headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
          baseWidth: baseScreenshotContents.width,
          baseHeight: baseScreenshotContents.height,
          headWidth: headScreenshotContents.width,
          headHeight: headScreenshotContents.height,
        },
      ];
    }

    const comparisonResult = compareImages({
      base: baseScreenshotContents,
      head: headScreenshotContents,
      pixelThreshold: diffPixelThreshold,
    });

    await writeScreenshotDiff({
      baseReplayId,
      headReplayId,
      screenshotFileName: headScreenshot.fileName,
      diff: comparisonResult.diff,
    });

    return [
      {
        identifier: headScreenshot.identifier,
        outcome:
          comparisonResult.mismatchFraction > diffThreshold
            ? "diff"
            : "no-diff",
        baseScreenshotFile: `screenshots/${baseScreenshot.fileName}`,
        headScreenshotFile: `screenshots/${headScreenshot.fileName}`,
        width: baseScreenshotContents.width,
        height: baseScreenshotContents.height,
        mismatchPixels: comparisonResult.mismatchPixels,
        mismatchFraction: comparisonResult.mismatchFraction,
      },
    ];
  };

  const headDiffResults = (
    await Promise.all(headReplayScreenshots.map(diffAgainstBase))
  ).flat();

  return [...missingHeadImagesResults, ...headDiffResults];
};
