import { TestCaseResult } from "@alwaysmeticulous/api";
import { getLatestTestRunResults } from "@alwaysmeticulous/client";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import log from "loglevel";

export interface GetCachedTestRunResultsOptions {
  client: AxiosInstance;
  commitSha: string;
}

export const getCachedTestRunResults = async ({
  client,
  commitSha,
}: GetCachedTestRunResultsOptions): Promise<TestCaseResult[]> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (!commitSha || commitSha === "unknown") {
    logger.warn("Test run cache not supported: no commit hash");
    return [];
  }

  const results =
    (await getLatestTestRunResults({ client, commitSha }))?.resultData
      ?.results ?? [];

  // Only return passing tests
  return results.filter(({ result }) => result === "pass");
};
