import type {
  MeticulousClient,
  TestRunForCommitResponse,
} from "@alwaysmeticulous/client";

export interface TestRunLookUp {
  /** What was looked up, for the "No test run found for …" notice. */
  subject: string;
  fetch: (client: MeticulousClient) => Promise<TestRunForCommitResponse>;
}
