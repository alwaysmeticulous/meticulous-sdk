import { Replay } from "@alwaysmeticulous/api";
import axios, { AxiosInstance } from "axios";

export const getReplay = async (
  client: AxiosInstance,
  replayId: string
): Promise<Omit<Replay, "project">> => {
  const { data } = await client.get(`replays/${replayId}`).catch((error) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return { data: null };
      }
    }
    throw error;
  });
  return data;
};

export interface ReplayDownloadUrlOutput {
  replayId: string;
  dowloadUrl: string;
}

export const getReplayDownloadUrl: (
  client: AxiosInstance,
  replayId: string
) => Promise<ReplayDownloadUrlOutput | null> = async (client, replayId) => {
  const { data } = await client
    .get<ReplayDownloadUrlOutput>(`replays/${replayId}/archive-url`)
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
