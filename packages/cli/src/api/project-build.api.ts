import axios, { AxiosInstance } from "axios";
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import https from "https";

export const getProjectBuild: (
  client: AxiosInstance,
  projectBuildId: string
) => Promise<any> = async (client, projectBuildId) => {
  const { data } = await client
    .get(`project-builds/${projectBuildId}`)
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

export const createProjectBuild: (
  client: AxiosInstance,
  commitSha: string
) => Promise<any> = async (client, commitSha) => {
  const { data } = await client.post(`project-builds`, {
    commitSha,
  });
  return data;
};

export interface ProjectBuildPushUrlOutput {
  projectBuildId: string;
  pushUrl: string;
}

export const getProjectBuildPushUrl: (
  client: AxiosInstance,
  projectBuildId: string
) => Promise<ProjectBuildPushUrlOutput | null> = async (
  client,
  projectBuildId
) => {
  const { data } = await client
    .get<ProjectBuildPushUrlOutput>(`project-builds/${projectBuildId}/push-url`)
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

export const uploadProjectBuildArchive: (
  uploadUrl: string,
  archivePath: string
) => Promise<void> = async (uploadUrl, archivePath) => {
  await axios.put(uploadUrl, await readFile(archivePath), {
    headers: {
      "Content-Type": "application/zip",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
};

export const putProjectBuildPushedStatus: (
  client: AxiosInstance,
  projectBuildId: string,
  status: "success" | "failure"
) => Promise<any> = async (client, projectBuildId, status) => {
  const { data } = await client.put(`project-builds/${projectBuildId}/pushed`, {
    status,
  });
  return data;
};
