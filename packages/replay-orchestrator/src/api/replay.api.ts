import { Replay } from "@alwaysmeticulous/api";
import axios, { AxiosInstance } from "axios";

export interface CreateReplayOptions {
  client: AxiosInstance;
  commitSha: string;
  sessionId: string;
  meticulousSha: string;
  version: "v1" | "v2";
  metadata: { [key: string]: any };
}

export const createReplay = async ({
  client,
  commitSha,
  sessionId,
  meticulousSha,
  version,
  metadata,
}: CreateReplayOptions): Promise<Replay> => {
  const { data } = await client.post("replays", {
    commitSha,
    sessionId,
    meticulousSha,
    version,
    metadata,
  });
  return data;
};

export interface ReplayPushUrlOutput {
  replayId: string;
  pushUrl: string;
}

export const getReplayPushUrl: (
  client: AxiosInstance,
  replayId: string
) => Promise<ReplayPushUrlOutput | null> = async (client, replayId) => {
  const { data } = await client
    .get<ReplayPushUrlOutput>(`replays/${replayId}/push-url`)
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

export const putReplayPushedStatus: (
  client: AxiosInstance,
  projectBuildId: string,
  status: "success" | "failure",
  replayCommandId: string
) => Promise<any> = async (client, projectBuildId, status, replayCommandId) => {
  const { data } = await client.put(`replays/${projectBuildId}/pushed`, {
    status,
    replayCommandId,
  });
  return data;
};

export const getReplayCommandId: (
  client: AxiosInstance,
  sessionId: string
) => Promise<string> = async (client, sessionId) => {
  const { data } = await client.post("replays/start", { sessionId });
  const { replayCommandId } = data as { replayCommandId: string };
  return replayCommandId;
};
