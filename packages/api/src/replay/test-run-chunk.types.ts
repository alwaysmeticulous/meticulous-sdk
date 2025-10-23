import { TestRunStatus } from "./test-run.types";

/**
 * Execution of a chunk of a test run chunk.
 *
 * The values and their meanings are the same as for {@link TestRunStatus}, except
 * it's not possible for a test run chunk to be in the `PostProcessing` status.
 */
export type TestRunChunkStatus = Omit<TestRunStatus, "PostProcessing">;
