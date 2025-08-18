import { Project } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export interface GetRepoUrlOptions {
  client: MeticulousClient;
}

export interface RepoUrlResponse {
  repoUrl: string;
}

export const getProject: (
  client: MeticulousClient,
) => Promise<Project | null> = async (client) => {
  const { data } = await client
    .get<Project>("projects/token-info")
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getRepoUrl = async ({
  client,
}: GetRepoUrlOptions): Promise<RepoUrlResponse> => {
  const { data } = await client
    .get<unknown, { data: RepoUrlResponse }>("projects/repo-url")
    .catch((error) => {
      if (isFetchError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};
