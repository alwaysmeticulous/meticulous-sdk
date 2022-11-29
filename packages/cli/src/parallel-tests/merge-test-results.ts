import {
  ScreenshotDiffResult,
  ScreenshotIdentifier,
} from "@alwaysmeticulous/api";
import { logger } from "@sentry/utils";
import { DetailedTestCaseResult } from "../config/config.types";

export interface TestCaseResults {
  comparisonToBaseReplay: DetailedTestCaseResult;
  comparisonsToFirstHeadReplay: DetailedTestCaseResult[];
}

export const mergeResults = ({
  comparisonToBaseReplay,
  comparisonsToFirstHeadReplay,
}: TestCaseResults): DetailedTestCaseResult => {
  if (comparisonsToFirstHeadReplay.length === 0) {
    return comparisonToBaseReplay;
  }

  // The other results all compare to the first result, so if any of them
  // show a diff on the screenshots that originally failed then we have a flake
  // on our hands
  const retriedScreenshotsById: Record<
    ScreenshotIdentifierHash,
    ScreenshotDiffResult[]
  > = {};
  comparisonsToFirstHeadReplay.forEach((otherResult) => {
    otherResult.screenshotDiffResults.forEach((result) => {
      const hash = hashScreenshotIdentifier(result.identifier);
      retriedScreenshotsById[hash] = retriedScreenshotsById[hash] ?? [];
      retriedScreenshotsById[hash].push(result);
    });
  });
  const newScreenshotDiffResults =
    comparisonToBaseReplay.screenshotDiffResults.map(
      (diffToBaseScreenshot): ScreenshotDiffResult => {
        if (diffToBaseScreenshot.outcome === "no-diff") {
          return diffToBaseScreenshot;
        }
        const hash = hashScreenshotIdentifier(diffToBaseScreenshot.identifier);
        const diffsToFirstScreenshot = retriedScreenshotsById[hash] ?? [];
        const allRetryScreenshotsHaveMatchingPixels =
          diffsToFirstScreenshot.every(({ outcome }) => outcome === "no-diff");
        if (allRetryScreenshotsHaveMatchingPixels) {
          return diffToBaseScreenshot;
        } else {
          return {
            identifier: diffToBaseScreenshot.identifier,
            outcome: "flake",
            individualDiffs: [
              diffToBaseScreenshot,
              ...diffsToFirstScreenshot,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ].map(({ identifier, ...rest }) => rest),
          };
        }
      }
    );

  const noLongerHasFailures = newScreenshotDiffResults.every(
    ({ outcome }) => outcome === "flake" || outcome === "no-diff"
  );

  return {
    ...comparisonToBaseReplay,
    result:
      comparisonToBaseReplay.result === "fail" && noLongerHasFailures
        ? "flake"
        : comparisonToBaseReplay.result,
  };
};

type ScreenshotIdentifierHash = string;

const hashScreenshotIdentifier = (
  identifier: ScreenshotIdentifier
): ScreenshotIdentifierHash => {
  if (identifier.type === "end-state") {
    return "end-state";
  } else if (identifier.type === "after-event") {
    return `after-event-${identifier.eventNumber}`;
  } else {
    unknownScreenshotIdentifierType(identifier);

    // The identifier is probably from a newer version of the bundle script
    // and we're on an old version of the CLI. Our best bet is to stringify it
    // and use that as a hash.
    return JSON.stringify(identifier);
  }
};

const unknownScreenshotIdentifierType = (identifier: never) => {
  logger.error(
    `Unknown type of screenshot identifier: ${JSON.stringify(identifier)}`
  );
};
