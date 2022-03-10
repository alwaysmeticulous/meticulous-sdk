import axios, { AxiosInstance } from "axios";

export const getRecordedSession: (
  client: AxiosInstance,
  sessionId: string
) => Promise<any> = async (client, sessionId) => {
  const { data } = await client.get(`sessions/${sessionId}`).catch((error) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return { data: null };
      }
    }
    throw error;
  });
  return data;
};

export const getRecordedSessionData: (
  client: AxiosInstance,
  sessionId: string
) => Promise<any> = async (client, sessionId) => {
  const { data } = await client
    .get(`sessions/${sessionId}/data`)
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
