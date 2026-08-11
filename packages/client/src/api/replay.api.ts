import type { Replay, S3Location } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

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
  /**
   * Grouped, NESTED artifact: a map of custom-check type to its snapshot
   * file. Unlike the flat `Record<string, S3Location>` index signature, the
   * URL lives at `entry.file.signedUrl` (there is no top-level `signedUrl`).
   * The backend returns `{}` for replays without custom-check snapshots.
   *
   * Declared explicitly so consumers don't mistake it for a flat
   * `S3Location` (which would lead to `signedUrl === undefined`).
   */
  customCheckSnapshots?: Record<string, { file: S3Location }>;
  /**
   * The replay's app-container logs. Declared explicitly because the flat
   * `Record<string, S3Location>` index signature above would otherwise type it
   * as always present, and it is genuinely optional: the server only returns it
   * when the artifact exists and the caller passed `includeAppContainerLogs`.
   */
  appContainerLogs?: S3Location;
};

export interface GetReplayV3DownloadUrlsOptions {
  includeScreenshots?: boolean;
  includeDiffs?: boolean;
  /**
   * Include the replay's app-container logs, when it has any. Opt-in because
   * the server has to check S3 for the artifact's existence, which the rest of
   * this response never does. Only ask for it if you will read it.
   */
  includeAppContainerLogs?: boolean;
}

export const getReplayV3DownloadUrls: (
  client: MeticulousClient,
  replayId: string,
  options?: GetReplayV3DownloadUrlsOptions,
) => Promise<ReplayV3UploadLocations | null> = async (
  client,
  replayId,
  options,
) => {
  const params: Record<string, string> = {};
  if (options?.includeScreenshots === false) {
    params["includeScreenshots"] = "false";
  }
  if (options?.includeDiffs === false) {
    params["includeDiffs"] = "false";
  }
  if (options?.includeAppContainerLogs === true) {
    params["includeAppContainerLogs"] = "true";
  }

  const { data } = await client
    .get<ReplayV3UploadLocations>(`replays/${replayId}/download-urls`, {
      params,
    })
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};
