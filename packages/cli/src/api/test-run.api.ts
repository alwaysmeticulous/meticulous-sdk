import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import axios, { AxiosError, AxiosInstance } from "axios";
import log from "loglevel";
import { TestCaseResult } from "../config/config.types";

export interface TestRun {
  id: string;
  status: "Running" | "Success" | "Failure";
  resultData?: {
    results: TestCaseResult[];
    [key: string]: any;
  };
  [key: string]: any;
}

export const getTestRun: (options: {
  client: AxiosInstance;
  testRunId: string;
}) => Promise<TestRun | null> = async ({ client, testRunId }) => {
  const { data } = await client.get(`test-runs/${testRunId}`).catch((error) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return { data: null };
      }
    }
    throw error;
  });
  return data;
};

export const createTestRun: (options: {
  client: AxiosInstance;
  commitSha: string;
  meticulousSha: string;
  configData: { [key: string]: any };
}) => Promise<TestRun> = async ({
  client,
  commitSha,
  meticulousSha,
  configData,
}) => {
  const { data } = await client.post("test-runs", {
    commitSha,
    meticulousSha,
    configData,
  });
  return data;
};

export const putTestRunResults: (options: {
  client: AxiosInstance;
  testRunId: string;
  status: "Running" | "Success" | "Failure";
  resultData: { [key: string]: any };
}) => Promise<TestRun> = async ({ client, testRunId, status, resultData }) => {
  const { data } = await client.put(`test-runs/${testRunId}/results`, {
    status,
    resultData,
  });
  return data;
};

export const getTestRunUrl = (testRun: TestRun) => {
  const { project } = testRun;
  const organizationName = encodeURIComponent(project.organization.name);
  const projectName = encodeURIComponent(project.name);
  const testRunUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/test-runs/${testRun.id}`;
  return testRunUrl;
};

export const getCachedTestRunResults: (options: {
  client: AxiosInstance;
  commitSha: string;
}) => Promise<TestCaseResult[]> = async ({ client, commitSha }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (!commitSha || commitSha === "unknown") {
    logger.warn("Test run cache not supported: no commit hash");
    return [];
  }

  const { data } = await client
    .get(`test-runs/cache?commitSha=${encodeURIComponent(commitSha)}`)
    .catch((error) => {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return { data: null };
      }
      throw error;
    });
  const results = (data as TestRun | null)?.resultData?.results || [];
  // Only return passing tests
  return results.filter(({ result }) => result === "pass");
};
