import {
  ScreenshotDiffResult,
  ScreenshotIdentifier,
  ScreenshotDiffResultMissingBaseAndHead,
  SingleTryScreenshotDiffResult,
  TestCase,
} from "@alwaysmeticulous/api";
import { DetailedTestCaseResult } from "../../config/config.types";

export const id = (eventNumber = 0): ScreenshotIdentifier => ({
  type: "after-event",
  eventNumber,
});

export const testResult = (
  result: "pass" | "fail" | "flake",
  screenshotDiffResults: ScreenshotDiffResult[],
  testCase?: TestCase
): DetailedTestCaseResult => {
  return {
    ...testCase,
    sessionId: testCase?.sessionId ?? "mock-session-id",
    headReplayId: "mock-head-replay-id",
    result,
    screenshotDiffResultsByBaseReplayId: new Map([
      ["mock-base-replay-id", screenshotDiffResults],
    ]),
  };
};

export const diff = (eventNumber?: number): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "diff",
    headScreenshotFile: "mock-head-file",
    baseScreenshotFile: "mock-base-file",
    width: 1920,
    height: 1080,
    mismatchFraction: 0.01,
    mismatchPixels: 1000,
  };
};

export const noDiff = (eventNumber?: number): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "no-diff",
    headScreenshotFile: "mock-head-file",
    baseScreenshotFile: "mock-base-file",
    width: 1920,
    height: 1080,
    mismatchFraction: 0.01,
    mismatchPixels: 1000,
  };
};

export const flake = (
  eventNumber: number,
  diffToBaseScreenshot: ScreenshotDiffResult,
  diffsToHeadScreenshotOnRetries: Array<
    | ScreenshotDiffResult
    | { identifier: ScreenshotIdentifier; outcome: "missing-base-and-head" }
  >
): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "flake",
    diffToBaseScreenshot: asSingleTryDiff(diffToBaseScreenshot),
    diffsToHeadScreenshotOnRetries:
      diffsToHeadScreenshotOnRetries.map(asRetryDiff),
  };
};

export const missingBase = (eventNumber?: number): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "missing-base",
    headScreenshotFile: "mock-head-file",
  };
};

export const missingHead = (eventNumber?: number): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "missing-head",
    baseScreenshotFile: "mock-base-file",
  };
};

export const missingBaseAndHead = (eventNumber?: number) => {
  return {
    identifier: id(eventNumber),
    outcome: "missing-base-and-head",
  } as const;
};

export const differentSize = (eventNumber?: number): ScreenshotDiffResult => {
  return {
    identifier: id(eventNumber),
    outcome: "different-size",
    baseScreenshotFile: "mock-base-file",
    headScreenshotFile: "mock-head-file",
    baseWidth: 1920,
    baseHeight: 1080,
    headWidth: 10,
    headHeight: 5,
  };
};

const asSingleTryDiff = ({
  identifier, // eslint-disable-line @typescript-eslint/no-unused-vars
  ...rest
}: ScreenshotDiffResult): SingleTryScreenshotDiffResult => {
  if (rest.outcome === "flake") {
    throw new Error("Must not be a diff with a flake outcome");
  }
  return rest;
};

type AnyScreenshotDiff =
  | ScreenshotDiffResult
  | {
      identifier: ScreenshotIdentifier;
      outcome: "missing-base-and-head";
    };

type RetryDiff =
  | SingleTryScreenshotDiffResult
  | ScreenshotDiffResultMissingBaseAndHead;

const asRetryDiff = ({
  identifier, // eslint-disable-line @typescript-eslint/no-unused-vars
  ...rest
}: AnyScreenshotDiff): RetryDiff => {
  if (rest.outcome === "flake") {
    throw new Error("Must not be a diff with a flake outcome");
  }
  return rest;
};
