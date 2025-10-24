import { Replay, S3Location } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export const getReplay = async (
  client: MeticulousClient,
  replayId: string,
): Promise<Omit<Replay, "project">> => {
  const { data } = await client.get(`replays/${replayId}`).catch((error) => {
    if (isFetchError(error) && error.response?.status === 404) {
      return { data: null };
    }

    throw maybeEnrichFetchError(error);
  });
  return data;
};

export interface ReplayDownloadUrlOutput {
  replayId: string;
  dowloadUrl: string;
}

export const getReplayDownloadUrl: (
  client: MeticulousClient,
  replayId: string,
) => Promise<ReplayDownloadUrlOutput | null> = async (client, replayId) => {
  const { data } = await client
    .get<ReplayDownloadUrlOutput>(`replays/${replayId}/archive-url`)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};

export type ReplayV3UploadLocations = Record<string, S3Location> & {
  screenshots: Record<string, { image: S3Location; metadata?: S3Location }>;
  diffs?: Record<
    string,
    Record<string, { thumbnail: S3Location; full: S3Location }>
  >;
};

export const getReplayV3DownloadUrls: (
  client: MeticulousClient,
  replayId: string,
) => Promise<ReplayV3UploadLocations | null> = async (client, replayId) => {
  const { data } = await client
    .get<ReplayV3UploadLocations>(`replays/${replayId}/download-urls`)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};
