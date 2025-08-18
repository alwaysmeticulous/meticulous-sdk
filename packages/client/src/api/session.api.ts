import { SessionData } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export const getRecordedSession = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<any> => {
  const { data } = await client.get(`sessions/${sessionId}`).catch((error) => {
    if (isFetchError(error) && error.response?.status === 404) {
      return { data: null };
    }

    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const getRecordedSessionData = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<SessionData> => {
  const { data } = await client
    .get(`sessions/${sessionId}/data`)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getRecordingCommandId: (
  client: MeticulousClient,
) => Promise<string> = async (client) => {
  const { data } = await client.post("sessions/start");
  const { recordingCommandId } = data as { recordingCommandId: string };
  return recordingCommandId;
};

export const postSessionIdNotification: (
  client: MeticulousClient,
  sessionId: string,
  recordingCommandId: string,
) => Promise<void> = async (client, sessionId, recordingCommandId) => {
  await client.post(`sessions/${sessionId}/notify`, { recordingCommandId });
};
