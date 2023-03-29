import { ReplayDiff, ReplayDiffData } from "@alwaysmeticulous/api";
import axios, { AxiosInstance } from "axios";

export const getReplayDiff = async ({
  client,
  replayDiffId,
}: {
  client: AxiosInstance;
  replayDiffId: string;
}): Promise<ReplayDiff | null> => {
  const { data } = await client
    .get(`replay-diffs/${replayDiffId}`)
    .catch((error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return { data: null };
        }
      }
      throw error;
    });
  return data;
};

export const createReplayDiff = async ({
  client,
  headReplayId,
  baseReplayId,
  testRunId,
  data: replayDiffData,
}: {
  client: AxiosInstance;
  headReplayId: string;
  baseReplayId: string;
  testRunId: string | null;
  data: ReplayDiffData;
}): Promise<ReplayDiff> => {
  const { data } = await client.post("replay-diffs", {
    headReplayId,
    baseReplayId,
    ...(testRunId ? { testRunId } : {}),
    data: replayDiffData,
  });
  return data;
};
