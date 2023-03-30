import {
  ScreenshotDiffResult,
  TestCaseResult,
  TestRun,
} from "@alwaysmeticulous/api";

export interface ExecuteTestRunResult {
  testRun: FinishedTestRunExecution;
  testCaseResults: DetailedTestCaseResult[];
}

export type TestRunExecution = Pick<
  TestRun,
  "id" | "url" | "status" | "project"
> & {
  progress: TestRunProgress;
  url: string;
};

export interface RunningTestRunExecution extends TestRunExecution {
  status: "Running";
}

export interface FinishedTestRunExecution extends TestRunExecution {
  status: "Success" | "Failure";
}

export interface TestRunProgress {
  failedTestCases: number;
  flakedTestCases: number;
  passedTestCases: number;
  runningTestCases: number;
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffResultsByBaseReplayId: Record<string, ScreenshotDiffResult[]>;
}
