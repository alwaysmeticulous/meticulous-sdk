import type {
  TestRunEventStatsResponse,
  ProjectDailyStatsResponse,
  TestRunStatsResponse,
} from "@alwaysmeticulous/api";
import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

export type {
  BulkStatsPagination,
  TestRunEventActor,
  TestRunEventDiffReportType,
  TestRunEventType,
  TestRunEventStatsItem,
  TestRunEventStatsPagination,
  TestRunEventStatsResponse,
  PrNumbersByBugPreventionCategory,
  ProjectDailyPrStats,
  ProjectDailyRunTimeStats,
  ProjectDailyStatsItem,
  ProjectDailyStatsResponse,
  TestRunStatsApprover,
  TestRunStatsItem,
  TestRunStatsResponse,
} from "@alwaysmeticulous/api";

export interface TestRunStatsOptions {
  project?: string;
  since?: string;
  until?: string;
  testRunIds?: string;
  prNumbers?: string;
  commitShas?: string;
  limit?: number;
  offset?: number;
}

export interface TestRunEventStatsOptions {
  project?: string;
  since?: string;
  until?: string;
  testRunIds?: string;
  prNumbers?: string;
  eventTypes?: string;
  cursor?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectDailyStatsOptions {
  project?: string;
  since: string;
  /** Defaults to now server-side when omitted. */
  until?: string;
  limit?: number;
  offset?: number;
}

export const getTestRunStats = async (
  client: MeticulousClient,
  options: TestRunStatsOptions = {},
): Promise<TestRunStatsResponse> =>
  getStats(
    client,
    "test-runs",
    toParams(options, {
      project: "project",
      since: "since",
      until: "until",
      testRunIds: "testRunId",
      prNumbers: "prNumber",
      commitShas: "commitSha",
      limit: "limit",
      offset: "offset",
    }),
  );

export const getProjectDailyStats = async (
  client: MeticulousClient,
  options: ProjectDailyStatsOptions,
): Promise<ProjectDailyStatsResponse> =>
  getStats(
    client,
    "project-daily",
    toParams(options, {
      project: "project",
      since: "since",
      until: "until",
      limit: "limit",
      offset: "offset",
    }),
  );

export const getTestRunEventStats = async (
  client: MeticulousClient,
  options: TestRunEventStatsOptions = {},
): Promise<TestRunEventStatsResponse> =>
  getStats(
    client,
    "test-run-events",
    toParams(options, {
      project: "project",
      since: "since",
      until: "until",
      testRunIds: "testRunId",
      prNumbers: "prNumber",
      eventTypes: "eventType",
      cursor: "cursor",
      limit: "limit",
      offset: "offset",
    }),
  );

const getStats = async <Response>(
  client: MeticulousClient,
  endpoint: string,
  params: Record<string, string>,
): Promise<Response> => {
  const { data } = await client
    .get(`agent/stats/${endpoint}`, { params })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

const toParams = <Options extends object>(
  options: Options,
  allowedParams: Record<keyof Options, string>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(allowedParams).flatMap(([key, parameter]) => {
      const value = options[key as keyof Options];
      return value == null ? [] : [[parameter, String(value)]];
    }),
  );
