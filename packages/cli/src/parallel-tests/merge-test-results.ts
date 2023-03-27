import {
  ScreenshotIdentifier,
  SingleTryScreenshotDiffResult,
} from "@alwaysmeticulous/api";
import { logger } from "@sentry/utils";
import stringify from "fast-json-stable-stringify";
import { DetailedTestCaseResult } from "../config/config.types";
import {
  flattenScreenshotDiffResults,
  groupScreenshotDiffResults,
  ScreenshotDiffResultWithBaseReplayId,
} from "./screenshot-diff-results.utils";

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
  // If any of the screenshots diffs in comparisonToHeadReplay show a diff against one
  // of the screenshots that orignally failed in currentResult then we have a flake
  // on our hands
  const retryDiffById = new Map<
    ScreenshotIdentifierHash,
    ScreenshotDiffResultWithBaseReplayId
  >();
  flattenScreenshotDiffResults(comparisonToHeadReplay).forEach((result) => {
    const hash = hashScreenshotIdentifier(result.identifier);
    if (retryDiffById.has(hash)) {
      throw new Error(
        `Received two screenshots for the same identifier '${hash}'. Screenshots should be unique.`
      );
    }
    retryDiffById.set(hash, result);
  });
  const newScreenshotDiffResults = flattenScreenshotDiffResults(
    currentResult
  ).map((currentDiff): ScreenshotDiffResultWithBaseReplayId => {
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

    if (diffWhenRetrying.outcome === "flake") {
      throw new Error(
        "Expected diffs when retrying and comparing to the original head screenshot to be first-try diffs, but got a flake."
      );
    }

    if (currentDiff.outcome === "flake") {
      return {
        ...currentDiff,
        diffsToHeadScreenshotOnRetries: [
          ...currentDiff.diffsToHeadScreenshotOnRetries,
          withoutIdentifiers(diffWhenRetrying),
        ],
      };
    } else if (diffWhenRetrying?.outcome === "no-diff") {
      return currentDiff;
    } else {
      return {
        baseReplayId: currentDiff.baseReplayId,
        identifier: currentDiff.identifier,
        outcome: "flake",
        diffToBaseScreenshot: withoutIdentifiers(currentDiff),
        diffsToHeadScreenshotOnRetries: [withoutIdentifiers(diffWhenRetrying)],
      };
    }
  });

  const noLongerHasFailures = newScreenshotDiffResults.every(
    ({ outcome }) => outcome === "flake" || outcome === "no-diff"
  );

  return {
    ...currentResult,
    result:
      currentResult.result === "fail" && noLongerHasFailures
        ? "flake"
        : currentResult.result === "pass" &&
          comparisonToHeadReplay.result === "fail"
        ? "fail"
        : currentResult.result,
    screenshotDiffResultsByBaseReplayId: groupScreenshotDiffResults(
      newScreenshotDiffResults
    ),
  };
};

const withoutIdentifiers = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  identifier: _identifier,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  baseReplayId: _baseReplayId,
  ...rest
}: {
  identifier: ScreenshotIdentifier;
  baseReplayId: string;
} & SingleTryScreenshotDiffResult) => rest;

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
    return stringify(identifier);
  }
};

const unknownScreenshotIdentifierType = (identifier: never) => {
  logger.error(
    `Unknown type of screenshot identifier: ${JSON.stringify(identifier)}`
  );
};
