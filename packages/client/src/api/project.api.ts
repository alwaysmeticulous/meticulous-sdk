import { Project } from "@alwaysmeticulous/api";
import { AxiosInstance, isAxiosError } from "axios";
import { maybeEnrichAxiosError } from "../errors";

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
