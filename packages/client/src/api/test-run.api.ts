import { TestRun } from "@alwaysmeticulous/api";
import { AxiosError, AxiosInstance } from "axios";

export interface GetLatestTestRunOptions {
  client: AxiosInstance;
  commitSha: string;
}

export const getLatestTestRunResults = async ({
  client,
  commitSha,
}: GetLatestTestRunOptions): Promise<TestRun | null> => {
  const { data } = await client
    .get(`test-runs/cache?commitSha=${encodeURIComponent(commitSha)}`)
    .catch((error) => {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return { data: null };
      }
      throw error;
    });
  return (data as TestRun | null) ?? null;
};

export const getLatestTestRunId = async (
  opts: GetLatestTestRunOptions
): Promise<string | null> => {
  return (await getLatestTestRunResults(opts))?.id ?? null;
};
