import { Project } from "@alwaysmeticulous/api";
import { AxiosInstance, isAxiosError } from "axios";
import { maybeEnrichAxiosError } from "../errors";

export interface GetRepoUrlOptions {
  client: AxiosInstance;
}

export interface RepoUrlResponse {
  repoUrl: string;
}

export const getProject: (
  client: AxiosInstance
) => Promise<Project | null> = async (client) => {
  const { data } = await client
    .get<Project>("projects/token-info")
    .catch((error) => {
      if (isAxiosError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichAxiosError(error);
    });
  return data;
};

export const getRepoUrl = async ({
  client,
}: GetRepoUrlOptions): Promise<RepoUrlResponse> => {
  const { data } = await client
    .get<unknown, { data: RepoUrlResponse }>("projects/repo-url")
    .catch((error) => {
      if (isAxiosError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};
