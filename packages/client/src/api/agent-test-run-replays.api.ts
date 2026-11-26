import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";
import type { TestRunProcessingResponse } from "./agent.api";

export const DEFAULT_TEST_RUN_REPLAYS_LIMIT = 100;
export const MAX_TEST_RUN_REPLAYS_LIMIT = 1000;

/**
 * One session a test run replayed. Unlike a screenshot diff, a row exists for
 * every replayed session — including the ones that matched their base exactly
 * — so a run with no differences still names the replays it ran.
 */
export interface TestRunReplay {
  sessionId: string;
  /** `pass` when every screenshot matched the base, `fail` when one differs, `flake` when the difference didn't reproduce. */
  result: "pass" | "fail" | "flake";
  headReplayId: string;
  /** Absent when the session had no base replay to compare against. */
  baseReplayId?: string;
  /** Absent when no replay diff was recorded for the session. */
  replayDiffId?: string;
}

export interface TestRunReplaysResponse {
  replays: TestRunReplay[];
  /** Server-written caveats (e.g. the paging notice), printed on stderr. */
  notes?: string[];
}

export interface GetTestRunReplaysOptions {
  limit?: number | undefined;
  offset?: number | undefined;
}

// Lists the sessions a test run replayed, with each one's head and base replay
// ids. `limit` is always applied server-side (default 100). An unfinished run
// answers { status: "processing", message } instead.
export const getTestRunReplays = async (
  client: MeticulousClient,
  testRunId: string,
  options: GetTestRunReplaysOptions = {},
): Promise<TestRunReplaysResponse | TestRunProcessingResponse> => {
  const params: Record<string, string> = {};
  if (options.limit != null) {
    params.limit = String(options.limit);
  }
  if (options.offset != null) {
    params.offset = String(options.offset);
  }
  const { data } = await client
    .get(`agent/test-runs/${testRunId}/replays`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
