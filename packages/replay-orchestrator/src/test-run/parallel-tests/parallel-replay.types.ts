import {
  TestCase,
  ScreenshotAssertionsEnabledOptions,
} from "@alwaysmeticulous/api";
import { ReplayEventsDependencies } from "@alwaysmeticulous/replayer";
import {
  GeneratedBy,
  ReplayExecutionOptions,
  ReplayTarget,
} from "@alwaysmeticulous/sdk-bundles-api";

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
