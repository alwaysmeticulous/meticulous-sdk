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
  progress: TestRunProgress;
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

export interface TestRunProgress {
  failedTestCases: number;
  flakedTestCases: number;
  passedTestCases: number;
  runningTestCases: number;
}

export interface DetailedTestCaseResult extends TestCaseResult {
  screenshotDiffDataByBaseReplayId: Record<string, ScreenshotDiffData>;
  totalNumberOfScreenshots: number;
  totalNumberOfSourceFiles: number;
}
