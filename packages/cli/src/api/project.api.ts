import { Project } from "@alwaysmeticulous/api";
import axios, { AxiosInstance } from "axios";

export const getProject: (
  client: AxiosInstance
) => Promise<Project | null> = async (client) => {
  const { data } = await client
    .get<Project>("projects/token-info")
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
