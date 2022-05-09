import { AxiosInstance } from "axios";

export interface TestRun {
  id: string;
  [key: string]: any;
}

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
