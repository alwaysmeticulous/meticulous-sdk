import { TestCase } from "@alwaysmeticulous/api";
import {
  GeneratedBy,
  ReplayEventsDependencies,
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common";
import { ScreenshotAssertionsEnabledOptions } from "../../../../cli/src/command-utils/common-types";

export interface ParallelTestsReplayOptions {
  replayTarget: ReplayTarget;
  executionOptions: ReplayExecutionOptions;
  screenshottingOptions: ScreenshotAssertionsEnabledOptions;
  testCase: TestCase;
  apiToken: string | null;
  commitSha: string;
  generatedBy: GeneratedBy;
  testRunId: string | null;
  baseTestRunId: string | null;
  replayEventsDependencies: ReplayEventsDependencies;
  suppressScreenshotDiffLogging: boolean;
}
