import { Replay } from "@alwaysmeticulous/common";
import axios, { AxiosInstance } from "axios";
import { getProject } from "./project.api";

export const getReplay = async (
  client: AxiosInstance,
  replayId: string
): Promise<Replay> => {
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

export const createReplay: (options: {
  client: AxiosInstance;
  commitSha: string;
  sessionId: string;
  meticulousSha: string;
  version: "v1" | "v2";
  metadata: { [key: string]: any };
}) => Promise<Replay> = async ({
  client,
  commitSha,
  sessionId,
  meticulousSha,
  version,
  metadata,
}) => {
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

export interface ScreenshotDiffStats {
  baseReplayId: string;
  headReplayId: string;
  stats: {
    width: number;
    height: number;
    mismatchPixels: number;
  };
}

export const postScreenshotDiffStats: (
  client: AxiosInstance,
  options: ScreenshotDiffStats
) => Promise<void> = async (client, { baseReplayId, headReplayId, stats }) => {
  await client.post(`replays/${headReplayId}/screenshot-diff`, {
    baseReplayId,
    stats,
  });
};

export const getReplayUrl = (replay: any) => {
  const organizationName = encodeURIComponent(replay.project.organization.name);
  const projectName = encodeURIComponent(replay.project.name);
  const replayUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/simulations/${replay.id}`;
  return replayUrl;
};

export const getDiffUrl: (
  client: AxiosInstance,
  baseReplayId: string,
  headReplayId: string
) => Promise<string> = async (client, baseReplayId, headReplayId) => {
  const project = await getProject(client);
  const organizationName = encodeURIComponent(project.organization.name);
  const projectName = encodeURIComponent(project.name);
  const diffUrl = `https://app.meticulous.ai/projects/${organizationName}/${projectName}/simulations/${headReplayId}/diff/${baseReplayId}`;
  return diffUrl;
};
