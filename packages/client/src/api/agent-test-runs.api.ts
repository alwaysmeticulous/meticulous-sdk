import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";
import type {
  GetTestRunsOptions,
  TestRunsResponse,
} from "./agent-test-runs.types";

// Lists the project's user-visible test runs, newest first: the PR runs by
// default, or with `baseTestRuns` the runs without a PR that PR runs are
// compared against. `limit` is always applied server-side (default 100).
export const getTestRuns = async (
  client: MeticulousClient,
  options: GetTestRunsOptions = {},
): Promise<TestRunsResponse> => {
  const params: Record<string, string> = {};
  for (const key of STRING_PARAMS) {
    const value = options[key];
    if (value != null) {
      params[key] = value;
    }
  }
  for (const key of BOOLEAN_PARAMS) {
    if (options[key]) {
      params[key] = "true";
    }
  }
  if (options.limit != null) {
    params.limit = String(options.limit);
  }
  if (options.offset != null) {
    params.offset = String(options.offset);
  }
  const { data } = await client
    .get("agent/projects/test-runs", { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

const STRING_PARAMS = [
  "project",
  "prNumber",
  "status",
  "checkIds",
  "createdSince",
  "createdUntil",
] as const satisfies ReadonlyArray<keyof GetTestRunsOptions>;

const BOOLEAN_PARAMS = [
  "baseTestRuns",
  "latestPerPullRequest",
  "withDiffsOnly",
  "withCheckIssuesOnly",
  "includeBaseTestRunId",
  "includeDiffCount",
  "includeDurationSeconds",
  "includeCheckIssueCounts",
] as const satisfies ReadonlyArray<keyof GetTestRunsOptions>;
