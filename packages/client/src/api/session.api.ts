import { SessionData } from "@alwaysmeticulous/api";
import { AxiosInstance, isAxiosError } from "axios";
import { maybeEnrichAxiosError } from "../errors";

export const getRecordedSession = async (
  client: AxiosInstance,
  sessionId: string
): Promise<any> => {
  const { data } = await client.get(`sessions/${sessionId}`).catch((error) => {
    if (isAxiosError(error) && error.response?.status === 404) {
      return { data: null };
    }

    throw maybeEnrichAxiosError(error);
  });
  return data;
};

export const getRecordedSessionData = async (
  client: AxiosInstance,
  sessionId: string
): Promise<SessionData> => {
  const { data } = await client
    .get(`sessions/${sessionId}/data`)
    .catch((error) => {
      if (isAxiosError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichAxiosError(error);
    });
  return data;
};

export const getRecordingCommandId: (
  client: AxiosInstance
) => Promise<string> = async (client) => {
  const { data } = await client.post("sessions/start");
  const { recordingCommandId } = data as { recordingCommandId: string };
  return recordingCommandId;
};

export const postSessionIdNotification: (
  client: AxiosInstance,
  sessionId: string,
  recordingCommandId: string
) => Promise<void> = async (client, sessionId, recordingCommandId) => {
  await client.post(`sessions/${sessionId}/notify`, { recordingCommandId });
};
