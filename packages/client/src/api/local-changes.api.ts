import type { TestCase } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

export interface GetRelevantSessionsParams {
  projectId: string;
  baseCommitSha: string;
  editedFilesWithLines: EditedFileWithLines[];
  minimumTimesToCoverEachLine?: number;
  loadSuperfluousTestCases?: boolean;
  /**
   * Adds `coverageSummary` to the response: for each requested range, which
   * base sessions reach it and whether the head test run replays one that
   * does. With it set, ranges no session reaches answer with an empty
   * `testCases` instead of an error.
   */
  includeCoverageSummary?: boolean;
  /**
   * The test run on the change's head commit. With `includeCoverageSummary`,
   * statuses are judged against the sessions this run executes.
   */
  testRunId?: string;
}

export interface EditedFileWithLines {
  filePath: string;
  editedRanges: CompactRange[];
}

export type CompactRange = [number, number];

export type GetRelevantSessionsResponse = {
  baseTestRunId?: string;
  baseTestRunUrl?: string;
  testCases: RelevantSession[];
  /** Set when `includeCoverageSummary` was requested. */
  coverageSummary?: CoverageSummary;
  error?: string;
};

/**
 * - `covered`: a session the head test run replays reaches every line of the
 *   range that any base session reaches.
 * - `partly_covered`: replayed sessions reach some of those lines, not all.
 * - `likely_covered`: base sessions reach the range, but the head test run's
 *   selection is not known.
 * - `uncovered`: no base session reaches the range, or none the head test run
 *   replays does (`reachingSessionCount` tells the two apart).
 * - `reached_everywhere`: nearly every base session reaches the range, so
 *   reaching it is no evidence the change was exercised.
 * - `unknown`: the file's coverage could not be mapped onto the requested
 *   line numbers.
 */
export type RangeCoverageStatus =
  | "covered"
  | "partly_covered"
  | "likely_covered"
  | "uncovered"
  | "reached_everywhere"
  | "unknown";

export interface RangeCoverageSummary {
  /** The coverage key the requested path aligned onto, e.g. `/packages/...`. */
  filePath: string;
  range: CompactRange;
  status: RangeCoverageStatus;
  linesInRange: number;
  /** Lines of the range at least one base session reaches. */
  linesReachedByBase: number;
  reachingSessionCount: number;
  /** Up to 20, sorted. */
  reachingSessionIds: string[];
  /** Set when the head test run's selection is known. */
  linesReachedBySelected?: number;
  selectedReachingSessionCount?: number;
  selectedReachingSessionIds?: string[];
}

export type CoverageSummarySelection =
  | { status: "known"; testRunId: string; selectedSessionCount: number }
  | {
      status: "unknown";
      reason:
        | "no_test_run_id"
        | "test_run_still_preprocessing"
        | "test_run_aborted";
      testRunId?: string;
    };

export type CoverageSummary =
  | {
      available: true;
      /** Sessions the coverage source replayed. */
      totalSessions: number;
      selection: CoverageSummarySelection;
      ranges: RangeCoverageSummary[];
    }
  | { available: false; reason: "coverage_not_read" };

export type RelevantSession = TestCase & {
  description: string | null;
  baseReplayId: string | null;
};

export const getRelevantSessions = async (
  client: MeticulousClient,
  params: GetRelevantSessionsParams,
): Promise<GetRelevantSessionsResponse> => {
  const { data } = await client
    .post<GetRelevantSessionsResponse>(
      "local-changes/relevant-sessions",
      params,
    )
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return {
          data: {
            testCases: [],
            error: error.response?.data?.message ?? error.message,
          },
        };
      }
      throw maybeEnrichFetchError(error);
    });
  return data;
};
