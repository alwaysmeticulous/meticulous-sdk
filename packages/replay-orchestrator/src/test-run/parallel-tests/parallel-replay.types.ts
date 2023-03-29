import {
  TestCase,
  ScreenshotAssertionsEnabledOptions,
} from "@alwaysmeticulous/api";
import {
  GeneratedBy,
  ReplayEventsDependencies,
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/common";

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
