import axios, { AxiosInstance, AxiosError } from "axios";

export const getProject: (client: AxiosInstance) => Promise<any> = async (
  client
) => {
  const { data: projectData } = await client
    .get("projects/token-info")
    .catch((error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return { data: null };
        }
      }
      throw error;
    });
  return projectData;
};
