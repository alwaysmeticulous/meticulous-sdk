import {
  ScreenshotDiffResult,
  ScreenshotIdentifier,
} from "@alwaysmeticulous/api";
import { logger } from "@sentry/utils";
import { DetailedTestCaseResult } from "../config/config.types";

export interface ResultsToMerge {
  currentResult: DetailedTestCaseResult;

  /**
   * The result of replaying the session once more against the head commit and
   * comparing the screenshots to those taken on the first replay against the head commit.
   */
  comparisonToHeadReplay: DetailedTestCaseResult;
}

export const mergeResults = ({
  currentResult,
  comparisonToHeadReplay,
}: ResultsToMerge): DetailedTestCaseResult => {
  // The other results all compare to the first result, so if any of them
  // show a diff on the screenshots that originally failed then we have a flake
  // on our hands
  const retryDiffById = new Map<
    ScreenshotIdentifierHash,
    ScreenshotDiffResult
  >();
  comparisonToHeadReplay.screenshotDiffResults.forEach((result) => {
    const hash = hashScreenshotIdentifier(result.identifier);
    if (retryDiffById.has(hash)) {
      throw new Error(
        `Received two screenshots for the same identifier '${hash}'. Screenshots should be unique.`
      );
    }
    retryDiffById.set(hash, result);
  });
  const newScreenshotDiffResults = currentResult.screenshotDiffResults.map(
    (currentDiff): ScreenshotDiffResult => {
      if (currentDiff.outcome === "no-diff") {
        return currentDiff;
      }
      const hash = hashScreenshotIdentifier(currentDiff.identifier);
      const diffWhenRetrying = retryDiffById.get(hash);

      // diffWhenRetrying is null in the case that there is a base screenshot for the base replay,
      // but the first replay on head did not generate a head screenshot (got 'missing-head'),
      // and the replay of that did not generate a head screenshot either (if the first replay on head
      // did generate a screenshot, then diffWhenRetrying.outcome would be 'missing-head' instead)
      if (diffWhenRetrying == null) {
        const diffToBaseScreenshotOutcome =
          currentDiff.outcome === "flake"
            ? currentDiff.diffToBaseScreenshot.outcome
            : currentDiff.outcome;
        if (diffToBaseScreenshotOutcome !== "missing-head") {
          throw new Error(`Expected to find a screenshot comparison for ${hash}, but none was found. The screenshot must
            have existed in the orginal replay, since the orginal comparison outcome was not '${diffToBaseScreenshotOutcome}'.`);
        }
        if (currentDiff.outcome === "flake") {
          // Original comparison had missing-head, so we re-ran to check if it was flakey. In this case
          // we got the same result.
          return {
            ...currentDiff,
            diffsToHeadScreenshotOnRetries: [
              ...currentDiff.diffsToHeadScreenshotOnRetries,
              { outcome: "missing-base-and-head" },
            ],
          };
        }
        return currentDiff; // no difference, both screenshots were missing
      }

      if (currentDiff.outcome === "flake") {
        return {
          ...currentDiff,
          diffsToHeadScreenshotOnRetries: [
            ...currentDiff.diffsToHeadScreenshotOnRetries,
            withoutIdentifier(diffWhenRetrying),
          ],
        };
      } else if (diffWhenRetrying?.outcome === "no-diff") {
        return currentDiff;
      } else {
        return {
          identifier: currentDiff.identifier,
          outcome: "flake",
          diffToBaseScreenshot: withoutIdentifier(currentDiff),
          diffsToHeadScreenshotOnRetries: [withoutIdentifier(diffWhenRetrying)],
        };
      }
    }
  );

  const noLongerHasFailures = newScreenshotDiffResults.every(
    ({ outcome }) => outcome === "flake" || outcome === "no-diff"
  );

  return {
    ...currentResult,
    result:
      currentResult.result === "fail" && noLongerHasFailures
        ? "flake"
        : currentResult.result,
    screenshotDiffResults: newScreenshotDiffResults,
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const withoutIdentifier = ({ identifier, ...rest }: ScreenshotDiffResult) =>
  rest;

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
