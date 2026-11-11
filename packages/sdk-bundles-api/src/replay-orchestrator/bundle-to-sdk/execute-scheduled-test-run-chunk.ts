import type { Project, TestRunChunkStatus } from "@alwaysmeticulous/api";
import type {
  DetailedTestCaseResult,
  ExecutionProgress,
} from "./execute-test-run";

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
  /**
   * Pass `interrupted` when the worker is being stopped from outside (e.g.
   * SIGTERM on a spot interruption) rather than failing on its own: the
   * sessions it finished are then kept when the chunk is next started.
   */
  markTestRunChunkAsFailed: (options?: {
    interrupted?: boolean;
  }) => Promise<void>;
}
