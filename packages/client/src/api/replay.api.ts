import { Replay } from "@alwaysmeticulous/api";
import { AxiosInstance, isAxiosError } from "axios";
import { maybeEnrichAxiosError } from "../errors";

export const getReplay = async (
  client: AxiosInstance,
  replayId: string
): Promise<Omit<Replay, "project">> => {
  const { data } = await client.get(`replays/${replayId}`).catch((error) => {
    if (isAxiosError(error) && error.response?.status === 404) {
      return { data: null };
    }

    throw maybeEnrichAxiosError(error);
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
      if (isAxiosError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichAxiosError(error);
    });
  return data;
};

export interface S3UploadLocation {
  filePath: string; // e.g. logs.ndjson.gz
  signedUrl: string; // signed S3 URL
}

export type ReplayV3UploadLocations = Record<string, S3UploadLocation> & {
  screenshots: Record<
    string,
    { image: S3UploadLocation; metadata?: S3UploadLocation }
  >;
  diffs?: Record<
    string,
    Record<string, { thumbnail: S3UploadLocation; full: S3UploadLocation }>
  >;
};

export const getReplayV3DownloadUrls: (
  client: AxiosInstance,
  replayId: string
) => Promise<ReplayV3UploadLocations | null> = async (client, replayId) => {
  const { data } = await client
    .get<ReplayV3UploadLocations>(`replays/${replayId}/download-urls`)
    .catch((error) => {
      if (isAxiosError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichAxiosError(error);
    });
  return data;
};
