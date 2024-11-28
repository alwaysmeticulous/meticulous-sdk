import { Project, TestRunChunkStatus } from "@alwaysmeticulous/api";
import { DetailedTestCaseResult, ExecutionProgress } from "./execute-test-run";

export interface ExecuteTestRunChunkResult {
  testRunChunk: TestRunChunkExecution;
  testCaseResults: DetailedTestCaseResult[];
}

export interface TestRunChunkExecution {
  testRunId: string;
  chunkNumber: number;
  status: TestRunChunkStatus;
  project: Project;
  progress: ExecutionProgress;
  testRunUrl: string;
}

export interface InProgressTestRunChunk {
  /**
   * The results of the tests that were executed within a test run chunk.
   * Resolves when the test run completes.
   */
  result: Promise<ExecuteTestRunChunkResult>;
  markTestRunChunkAsFailed: () => Promise<void>;
}
