import { Project, TestCaseResult, TestRunStatus } from "@alwaysmeticulous/api";
import { ScreenshotDiffData } from "./execute-replay";

export interface ExecuteTestRunResult {
  testRun: FinishedTestRunExecution;
  testCaseResults: DetailedTestCaseResult[];
}

export interface TestRunExecution {
  id: string;
  status: TestRunStatus;
  project: Project;
  progress: ExecutionProgress;
  url: string;
}

export interface RunningTestRunExecution extends TestRunExecution {
  status: "Running";
}

export interface FinishedTestRunExecution extends TestRunExecution {
  status: "Success" | "Failure";
  coverageInfo?: TestRunCoverageInfo;
}

export interface TestRunCoverageInfo {
  totalFilesCovered: number;
  editedFileCoverage?: TestRunEditedCoverage;
}

export interface TestRunEditedCoverage {
  hadCoverageData?: boolean;
  executableLinesEdited: number;
  executableLinesEditedAndCovered: number;
}

export interface ExecutionProgress {
  failedTestCases: number;
  flakedTestCases: number;
  passedTestCases: number;
  runningTestCases: number;
}

/**
 * @deprecated Use `ExecutionProgress` instead.
 */
export type TestRunProgress = ExecutionProgress;

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffDataByBaseReplayId: Record<string, ScreenshotDiffData>;
  totalNumberOfScreenshots: number;
  totalNumberOfSourceFiles: number;
}
